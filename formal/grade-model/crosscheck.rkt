#lang racket

(require json
         "grade-model.rkt")

(define tolerance 0.05)

(define (json-number->rational v)
  (cond
    [(eq? v 'null) 'null]
    [(number? v) (inexact->exact v)]
    [else (error 'crosscheck "expected number or null, got ~v" v)]))

(define (case-ref c key)
  (hash-ref c key (lambda () (error 'crosscheck "missing key ~a in ~v" key c))))

(define (matches? actual expected)
  (cond
    [(and (eq? actual 'null) (eq? expected 'null)) #t]
    [(or (eq? actual 'null) (eq? expected 'null)) #f]
    [else (<= (abs (- actual expected)) tolerance)]))

(define (format-value v)
  (if (eq? v 'null) "null" (format "~a" v)))

(define (main)
  (define args (current-command-line-arguments))
  (define path
    (if (zero? (vector-length args))
        "formal/grade-model/cases.json"
        (vector-ref args 0)))
  (define cases (call-with-input-file path read-json))
  (unless (list? cases)
    (error 'crosscheck "expected a JSON array in ~a" path))

  (define mismatches
    (for/list ([c (in-list cases)]
               [i (in-naturals 1)]
               #:unless
               (let* ([pc (json-number->rational (case-ref c 'pc))]
                      [work (json-number->rational (case-ref c 'work))]
                      [expected (case-ref c 'expected)]
                      [actual (quarter-grade pc work)])
                 (matches? actual expected)))
      (let* ([pc (json-number->rational (case-ref c 'pc))]
             [work (json-number->rational (case-ref c 'work))]
             [expected (case-ref c 'expected)]
             [actual (quarter-grade pc work)])
        (hash 'index i
              'pc (case-ref c 'pc)
              'work (case-ref c 'work)
              'expected expected
              'actual actual))))

  (define total (length cases))
  (if (null? mismatches)
      (printf "PASS ~a/~a~n" total total)
      (begin
        (printf "FAIL ~a/~a~n" (- total (length mismatches)) total)
        (for ([m (in-list mismatches)])
          (printf "case ~a: pc=~a work=~a expected=~a actual=~a~n"
                  (hash-ref m 'index)
                  (format-value (hash-ref m 'pc))
                  (format-value (hash-ref m 'work))
                  (format-value (hash-ref m 'expected))
                  (format-value (hash-ref m 'actual))))
        (exit 1))))

(module+ main
  (main))
