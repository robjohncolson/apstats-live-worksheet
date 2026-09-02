#lang racket

;; wallet-model.rkt — a PLT Redex formal model of the candy↔DOGE conservation
;; arithmetic (WALLET_CONSERVATION_AUDIT_SPEC.md Layer C). State = the doge_account
;; columns that carry conservation value:
;;
;;   acct = (E R Z G C M Bal Sent)
;;     E    Earned        (effort faucet, monotonic up)
;;     R    Received      candy_gifted_in
;;     Z    Realized      candy_realized   (signed net cash-out P&L)
;;     G    Gifted        candy_gifted_out
;;     C    Converted     doge_cost_basis  (candy spent buying DOGE, avg basis)
;;     M    Materialized  candy_given
;;     Bal  doge_balance
;;     Sent doge_sent
;;
;; The 7-number identity (spec §1 I1):  E + R + Z = G + C + M + Owed,  Owed = E+R+Z−G−C−M.
;;
;; Scope (mirrors formal/grade-model's "model the non-trivial fold, not the guards"):
;; this models the COLUMN ARITHMETIC of every accepted transition — especially the
;; sell's avg-cost-basis unwind + realized P&L, and the mark-given/mark-sent CLAMPS,
;; which it re-derives independently in EXACT RATIONALS (no float drift). The spend /
;; FIFO-maturity GUARDS (I4) are fuzzed in Layers A/B; the cross-check feeds only the
;; JS-accepted op stream, and crosscheck.rkt re-derives the final columns here and
;; checks they match the JS reducer AND that I1/I3/I5/I7 hold at every step.
;;
;; 2026-09-02: CANDY_RETURN_SPEC v1 intentionally excludes give_back and the
;; candy_returned column from this Redex layer, following the stakes precedent.
;; Layers A/B model and differential-test it; wallet-model-emit-cases.mjs filters
;; give_back so this eight-column model never receives an unsupported transition.
;;
;; Redex note (from grade-model): pattern variables must be a nonterminal name with
;; an optional _subscript (n_E). A bare identifier is a LITERAL. Arithmetic is done
;; in Racket escapes `,(...)` over exact rationals.

(require redex/reduction-semantics)
(provide Wallet apply-op owed sent-le-bal? mono-ok? owed-nonneg?)

(define-language Wallet
  (n number)
  (acct (n n n n n n n n))                ; E R Z G C M Bal Sent
  (op (earn n)
      (buy n n)            ; candy, coins   (coins precomputed = dogeFromCandy)
      (sell n n)           ; doge, rate     (rate = candyPerDoge(price))
      (gift-out n)         ; candy out (sender leg)
      (gift-in n)          ; candy in  (recipient leg)
      (mark-given n)       ; requested amount → clamped to Owed-eligible
      (mark-sent n)))      ; requested amount → clamped to Bal

;; avg cost basis unwound by selling n_d of n_bal coins carrying n_C basis.
(define (basis-of C d bal) (if (> bal 0) (* C (/ d bal)) 0))
;; monotone clamp: never below cur, never above hi (markEndpoint).
(define (clamp-up cur add hi) (max cur (min (+ cur add) hi)))

;; Owed (spendable) = E + R + Z − G − C − M.
(define-metafunction Wallet
  owed : acct -> n
  [(owed (n_E n_R n_Z n_G n_C n_M n_bal n_sent))
   ,(- (+ (term n_E) (term n_R) (term n_Z)) (+ (term n_G) (term n_C) (term n_M)))])

;; apply-op : the column update for ONE accepted op (exact rationals).
(define-metafunction Wallet
  apply-op : acct op -> acct
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (earn n_c))
   (,(+ (term n_E) (term n_c)) n_R n_Z n_G n_C n_M n_bal n_sent)]

  ;; buy: candy → DOGE. Converted += candy, Bal += coins.
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (buy n_c n_coins))
   (n_E n_R n_Z n_G
    ,(+ (term n_C) (term n_c)) n_M
    ,(+ (term n_bal) (term n_coins)) n_sent)]

  ;; sell: DOGE → candy. Bal −= d; Converted −= basis (floored 0); Realized += payout − basis.
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (sell n_d n_rate))
   (n_E n_R
    ,(+ (term n_Z) (- (* (term n_d) (term n_rate)) (basis-of (term n_C) (term n_d) (term n_bal))))
    n_G
    ,(max 0 (- (term n_C) (basis-of (term n_C) (term n_d) (term n_bal))))
    n_M
    ,(- (term n_bal) (term n_d)) n_sent)]

  ;; gift legs: sender Gifted += c; recipient Received += c.
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (gift-out n_c))
   (n_E n_R n_Z ,(+ (term n_G) (term n_c)) n_C n_M n_bal n_sent)]
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (gift-in n_c))
   (n_E ,(+ (term n_R) (term n_c)) n_Z n_G n_C n_M n_bal n_sent)]

  ;; mark-given: Materialized clamped up to the Owed-eligible cap = E+R+Z−G−C (= Owed+M).
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (mark-given n_a))
   (n_E n_R n_Z n_G n_C
    ,(clamp-up (term n_M) (term n_a)
               (- (+ (term n_E) (term n_R) (term n_Z)) (+ (term n_G) (term n_C))))
    n_bal n_sent)]

  ;; mark-sent: doge_sent clamped up to Bal.
  [(apply-op (n_E n_R n_Z n_G n_C n_M n_bal n_sent) (mark-sent n_a))
   (n_E n_R n_Z n_G n_C n_M n_bal
    ,(clamp-up (term n_sent) (term n_a) (term n_bal)))])

;; ── Invariant predicates over an acct (used by crosscheck.rkt) ────────────────
(define (acct->list a) a)
;; I7 — doge_sent ≤ doge_balance.
(define (sent-le-bal? a) (<= (list-ref a 7) (+ (list-ref a 6) 1/1000000)))
;; I3 — Owed ≥ 0.
(define (owed-nonneg? a)
  (>= (- (+ (list-ref a 0) (list-ref a 1) (list-ref a 2))
         (+ (list-ref a 3) (list-ref a 4) (list-ref a 5)))
      -1/1000000))
;; I5 — M and Sent never decrease; C up only on buy / down only on sell (checked by
;; the caller which knows the op). Here: the pure non-decrease of M and Sent.
(define (mono-ok? before after)
  (and (>= (list-ref after 5) (- (list-ref before 5) 1/1000000))    ; M
       (>= (list-ref after 7) (- (list-ref before 7) 1/1000000))))  ; Sent
