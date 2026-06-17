#lang racket

;; grade-model.rkt — a PLT Redex formal model of the v3 quarter-grade FOLD:
;; given a PC-track average and a Work-track average (each a rational in [0,1] or
;; 'null), compute the 0..100 quarter grade exactly as roster-server/lesson-grade.js
;; does (combineV3 -> quarterGradeV3 -> to100). Cross-checked against the JS engine
;; on 1000 cases by crosscheck.rkt (GRADE_SIMULATION_SPEC.md Layer C).
;;
;; Scope: this models the non-trivial conditional logic — the 40%/70% gates, the
;; max-vs-mean branch, null-track handling, and the IEEE rounding. The Work-track
;; weighting (workAvgV3, a plain weighted mean) is unit-tested on the JS side and
;; not re-modeled here.
;;
;; Redex note: pattern variables must be a nonterminal name, optionally with a
;; _subscript (e.g. n_pc). A BARE identifier (pc, floor) is a LITERAL, not a
;; variable — that was the original bug. Numbers use the built-in `number`
;; pattern (`rational` is NOT a Redex built-in). Gates + rounding are done in
;; FLONUM to mirror JS's IEEE doubles bit-for-bit (exact arithmetic diverges by
;; 0.1 at .5 rounding boundaries).

(require redex/reduction-semantics)

(provide quarter-grade)

(define-language GradePolicy
  (n number)
  (maybe n null))

;; quarterGradeV3(pc, work, floor, ceiling):
;;   both >= floor -> max(pc, work)
;;   else          -> max(ceiling*pc, ceiling*work, mean(pc, work))
(define-metafunction GradePolicy
  quarter-grade-v3 : n n n n -> n
  [(quarter-grade-v3 n_pc n_work n_floor n_ceiling)
   ,(max (term n_pc) (term n_work))
   (side-condition (and (>= (term n_pc) (term n_floor))
                        (>= (term n_work) (term n_floor))))]
  [(quarter-grade-v3 n_pc n_work n_floor n_ceiling)
   ,(max (* (term n_ceiling) (term n_pc))
         (* (term n_ceiling) (term n_work))
         (/ (+ (term n_pc) (term n_work)) 2))])

;; combineV3: a null track means "not yet due" — the present track alone sets
;; the grade until BOTH are present.
(define-metafunction GradePolicy
  combine : maybe maybe n n -> maybe
  [(combine null null n_floor n_ceiling) null]
  [(combine null n_work n_floor n_ceiling) n_work]
  [(combine n_pc null n_floor n_ceiling) n_pc]
  [(combine n_pc n_work n_floor n_ceiling) (quarter-grade-v3 n_pc n_work n_floor n_ceiling)])

;; to100 = Math.round(x*1000)/10, in FLONUM so half-up rounding matches JS.
(define-metafunction GradePolicy
  to100 : maybe -> maybe
  [(to100 null) null]
  [(to100 n) ,(/ (floor (+ (* (real->double-flonum (term n)) 1000.0) 0.5)) 10)])

;; Default gates, as FLONUMS (mirror grade-config.js v3Gates {floor:0.4, ceiling:0.7}).
(define floor-gate 0.4)
(define single-track-ceiling 0.7)

(define (valid-track? v)
  (or (eq? v 'null)
      (and (rational? v) (<= 0 v) (<= v 1))))

;; (quarter-grade pc work) : the modeled 0..100 grade (or 'null), for crosscheck.
(define/contract (quarter-grade pc work)
  (-> valid-track? valid-track? (or/c number? 'null))
  (term (to100 (combine ,pc ,work ,floor-gate ,single-track-ceiling))))
