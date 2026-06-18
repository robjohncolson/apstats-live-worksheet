#lang racket

;; crosscheck.rkt — Layer C cross-check (WALLET_CONSERVATION_AUDIT_SPEC.md Layer C).
;; Reads the JS-oracle cases (formal/wallet-model/cases.json), replays each student's
;; ACCEPTED op stream through the Redex column model (wallet-model.rkt) in EXACT
;; rationals, and asserts:
;;   • the final columns match the JS reducer within tolerance (the differential), and
;;   • I3 (Owed ≥ 0), I7 (Sent ≤ Bal) and I5 (M, Sent non-decreasing) hold at EVERY step.
;; Prints `PASS n/n` when the Redex model and the JS reducer agree on all cases.

(require json
         redex/reduction-semantics
         "wallet-model.rkt")

(define tol 1/1000000)            ; 1e-6 (exact)

;; A JSON op array ["buy" 3 7.5] → a Redex op term (buy 3 7.5) with exact numbers.
(define (json-op->term o)
  (cons (string->symbol (car o)) (map inexact->exact (cdr o))))

(define (apply-one acct op) (term (apply-op ,acct ,op)))

(define (close? a b) (<= (abs (- a b)) tol))
(define (accts-close? a b) (and (= (length a) (length b)) (andmap close? a b)))

(define ZERO (list 0 0 0 0 0 0 0 0))

;; Replay one case; return #f when it holds, else a failure descriptor.
(define (check-case c)
  (define ops (map json-op->term (hash-ref c 'ops)))
  (define expected (map inexact->exact (hash-ref c 'expected)))
  (let loop ([acct ZERO] [todo ops])
    (cond
      [(null? todo)
       (if (accts-close? acct expected) #f (list 'mismatch acct expected))]
      [else
       (define op (car todo))
       (define next (apply-one acct op))
       (cond
         [(not (owed-nonneg? next)) (list 'I3 op next)]
         [(not (sent-le-bal? next)) (list 'I7 op next)]
         [(not (mono-ok? acct next)) (list 'I5 op next)]
         [else (loop next (cdr todo))])])))

(define (main)
  (define args (current-command-line-arguments))
  (define path (if (zero? (vector-length args)) "formal/wallet-model/cases.json" (vector-ref args 0)))
  (define cases (call-with-input-file path read-json))
  (unless (list? cases) (error 'crosscheck "expected a JSON array in ~a" path))

  (define fails
    (for/list ([c (in-list cases)] [i (in-naturals 1)]
               #:when (check-case c))
      (cons i (check-case c))))

  (define total (length cases))
  (if (null? fails)
      (printf "PASS ~a/~a~n" total total)
      (begin
        (printf "FAIL ~a/~a~n" (- total (length fails)) total)
        (for ([f (in-list (take fails (min 10 (length fails))))])
          (printf "case ~a: ~v~n" (car f) (cdr f)))
        (exit 1))))

(module+ main (main))
