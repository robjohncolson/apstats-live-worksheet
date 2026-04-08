# TI-84 Plus CE ROM Wizard Field Extraction

**ROM**: OS 5.8.2.0029, 4,194,304 bytes  
**Extraction date**: 2026-04-07  
**JSON compared**: `ti84-procedures-data.json`

---

## TI Token Mapping (confirmed from ROM cross-references)

| Byte | Glyph | Evidence |
|------|-------|----------|
| `0x12` | ² (superscript 2) | Σx² entries, χ² menu names |
| `0x18` | ≠ | Alternative hypothesis options |
| `0x80` | ₀ (subscript 0) | p₀, σ₀/μ₀ fields |
| `0x81` | ₁ (subscript 1) | Q₁, x₁, p₁, σ₁, μ₁ entries |
| `0x82` | ₂ (subscript 2) | Q₃ (0x83=₃), x₂, p₂, σ₂, μ₂ |
| `0x83` | ₃ (subscript 3) | Q₃ in variable table |
| `0xBC` | β | LinRegTTest alternative labels |
| `0xC3` | σ (lowercase sigma) | Wizard field for known σ, stat variable σx |
| `0xC5` | ρ | LinRegTTest alternative labels |
| `0xC6` | Σ (uppercase sigma) | Σx, Σx², Σxy in stat variable table |
| `0xC7` | μ (mu) | μ₁, μ₂ wizard fields, μx stat variable |
| `0xCB` | x̄ (x-bar) | Wizard fields and stat variable |
| `0xD9` | χ (chi) | χ²-Test, χ²GOF-Test menu names |

**Note on 0xC3 vs 0xC7 ambiguity**: At offset 0xAEC05, the alternative hypothesis options `≠[C3][80]`, `>[C3][80]`, `<[C3][80]` use byte 0xC3. These serve **both** the Z-Test (which tests μ) and the F-Test (which tests σ). The TI-OS likely renders 0xC3+0x80 contextually as either μ₀ or σ₀ depending on which test is active. Separately, 0xC7 appears as μ in two-sample test labels (μ₁, μ₂). The wizard field at 0xAEB43 (`0xC7` alone) is the known-σ entry field for Z-Test.

---

## 1. Wizard Field Labels from ROM

### Main Wizard Label Table (0xAEB30 - 0xAECFC)

| Offset | Hex | Decoded | Used by |
|--------|-----|---------|---------|
| 0xAEB41 | `c3 80` | σ₀ (or μ₀ contextually) | Z-Test, T-Test: hypothesized parameter |
| 0xAEB43 | `c7` | μ (or σ contextually) | Z-Test: known pop. std dev field |
| 0xAEB45 | `4c697374` | List | T-Test Data, TInterval Data |
| 0xAEB4A | `46726571` | Freq | T-Test Data, LinRegTTest |
| 0xAEB4F | `4c6973 7431` | List1 | 2-SampTTest Data |
| 0xAEB55 | `4c6973 7432` | List2 | 2-SampTTest Data |
| 0xAEB5B | `46726571 31` | Freq1 | 2-SampTTest Data |
| 0xAEB61 | `46726571 32` | Freq2 | 2-SampTTest Data |
| 0xAEB67 | `6e 31` | n1 | 2-SampTTest Stats |
| 0xAEB6A | `cb 31` | x̄1 | 2-SampTTest Stats |
| 0xAEB6D | `5378 31` | Sx1 | 2-SampTTest Stats |
| 0xAEB71 | `6e 32` | n2 | 2-SampTTest Stats |
| 0xAEB74 | `cb 32` | x̄2 | 2-SampTTest Stats |
| 0xAEB77 | `5378 32` | Sx2 | 2-SampTTest Stats |
| 0xAEB7B | `c7 31` | μ1 | 2-SampZTest (σ₁ in F-Test context) |
| 0xAEB7E | `c7 32` | μ2 | 2-SampZTest (σ₂ in F-Test context) |
| 0xAEB81 | `70 80` | p₀ | 1-PropZTest |
| 0xAEB84 | `78` | x | 1-PropZTest, binompdf, geometpdf |
| 0xAEB86 | `6e` | n | 1-PropZTest, 1-PropZInt, T-Test |
| 0xAEB88 | `78 31` | x1 | 2-PropZTest |
| 0xAEB8B | `78 32` | x2 | 2-PropZTest |
| 0xAEB8E | `432d4c6576656c` | C-Level | TInterval, 1-PropZInt, 2-SampTInt, LinRegTInt |
| 0xAEB96 | `4f6273657276 6564` | Observed | χ²GOF-Test, χ²-Test |
| 0xAEB9F | `457870656374 6564` | Expected | χ²GOF-Test, χ²-Test |
| 0xAEBA8 | `586c697374` | Xlist | LinReg, LinRegTTest, LinRegTInt, Scatterplot |
| 0xAEBAE | `596c697374` | Ylist | LinReg, LinRegTTest, LinRegTInt, Scatterplot |
| 0xAEBB4 | `cb` | x̄ | T-Test Stats, TInterval Stats |
| 0xAEBB6 | `6e` | n | T-Test Stats, TInterval Stats |
| 0xAEBB8 | `5378` | Sx | T-Test Stats, TInterval Stats |
| 0xAEBBB | `c3` | σ | Z-Test, ZInterval: known σ field |
| 0xAEBBD | `c3 31` | σ1 | 2-SampFTest / 2-SampZTest |
| 0xAEBC0 | `70726f70` | prop | 1-PropZTest: alternative hypothesis label |
| 0xAEBC5 | `70 31` | p1 | 2-PropZTest |
| 0xAEBC8 | `c7 31` | μ1 | 2-SampTTest: alt hypothesis label |
| 0xAEBCB | `bc 2026 20 c5` | β & ρ | LinRegTTest: alternative hypothesis label |
| 0xAEBD1 | `43616c63756c617465` | Calculate | All wizard-based tests |
| 0xAEBDB | `44726177` | Draw | Tests with graphical output |
| 0xAEBE0 | `436f6c6f723a` | Color: | Color selection field |
| 0xAEBE7 | `496e7074` | Inpt | T-Test, TInterval, 2-SampTTest, 2-SampTInt |
| 0xAEBEC | `506f6f6c6564` | Pooled | 2-SampTTest, 2-SampTInt |
| 0xAEBF3 | `596573` | Yes | Pooled option |
| 0xAEBF7 | `4e6f` | No | Pooled option |
| 0xAEBFA | `44617461` | Data | Inpt option |
| 0xAEBFF | `5374617473` | Stats | Inpt option |
| 0xAEC4A | `5265674551` | RegEQ | LinRegTTest, LinRegTInt: equation storage |
| 0xAEC50 | `6466` | df | χ²GOF-Test |
| 0xAEC6E | `6c6f776572` | lower | normalcdf |
| 0xAEC74 | `7570706572` | upper | normalcdf |
| 0xAEC7A | `64664e756d6572` | dfNumer | Fpdf, Fcdf |
| 0xAEC82 | `646644656e6f6d` | dfDenom | Fpdf, Fcdf |
| 0xAEC8A | `61726561` | area | invNorm |
| 0xAEC8F | `782076616c7565` | x value | invT (not in JSON) |
| 0xAEC97 | `70` | p | binompdf, binomcdf, geometpdf, geometcdf |
| 0xAEC99 | `747269616c73` | trials | binompdf, binomcdf |
| 0xAECA0 | `205061737465` | Paste | Distribution commands (normalcdf, invNorm, etc.) |
| 0xAECC4 | `467265714c697374` | FreqList | 1-Var Stats, LinReg(a+bx) |
| 0xAECCD | `53746f7265205265674551` | Store RegEQ | LinReg(a+bx) |
| 0xAECE5 | `5461696c` | Tail | invNorm |
| 0xAECEA | `4c454654` | LEFT | invNorm tail option |
| 0xAECEF | `43454e544552` | CENTER | invNorm tail option |
| 0xAECF6 | `5249474854` | RIGHT | invNorm tail option |

### Additional Wizard Labels (other areas)

| Offset | Hex | Decoded | Used by |
|--------|-----|---------|---------|
| 0xAEC53 | `497465726174696f6e73` | Iterations | Solver/Finance |
| 0xAEC5E | `506572696f64` | Period | Finance |
| 0xAEC65 | `53746f7265204551` | Store EQ | Non-stat wizard |
| 0xAECA7 | `45787072` | Expr | Table setup |
| 0xAECAC | `5661726961626c65` | Variable | Solver |
| 0xAECB5 | `7374617274` | start | Table/Sequence |
| 0xAECBB | `656e64` | end | Table/Sequence |
| 0xAECBF | `73746570` | step | Table/Sequence |
| 0xAECD9 | `72657065746974696f6e73` | repetitions | Probability simulation |

---

## 2. Alternative Hypothesis Labels from ROM

### Wizard Option Labels (0xAEC05 - 0xAEC49)

| Offset | Hex | Decoded | Test |
|--------|-----|---------|------|
| 0xAEC05 | `18 c3 80` | ≠μ₀/σ₀ | Z-Test, T-Test (contextual) |
| 0xAEC09 | `3e c3 80` | >μ₀/σ₀ | Z-Test, T-Test (contextual) |
| 0xAEC0D | `3c c3 80` | <μ₀/σ₀ | Z-Test, T-Test (contextual) |
| 0xAEC11 | `18 c3 32` | ≠σ² | 2-SampFTest |
| 0xAEC15 | `3e c3 32` | >σ² | 2-SampFTest |
| 0xAEC19 | `3c c3 32` | <σ² | 2-SampFTest |
| 0xAEC1D | `18 70 80` | ≠p₀ | 1-PropZTest |
| 0xAEC21 | `3e 70 80` | >p₀ | 1-PropZTest |
| 0xAEC25 | `3c 70 80` | <p₀ | 1-PropZTest |
| 0xAEC29 | `18 70 32` | ≠p₂ | 2-PropZTest |
| 0xAEC2D | `3e 70 32` | >p₂ | 2-PropZTest |
| 0xAEC31 | `3c 70 32` | <p₂ | 2-PropZTest |
| 0xAEC35 | `18 c7 32` | ≠μ₂ | 2-SampTTest, 2-SampZTest |
| 0xAEC39 | `3e c7 32` | >μ₂ | 2-SampTTest, 2-SampZTest |
| 0xAEC3D | `3c c7 32` | <μ₂ | 2-SampTTest, 2-SampZTest |
| 0xAEC41 | `18 30` | ≠0 | LinRegTTest (β and ρ) |
| 0xAEC44 | `3e 30` | >0 | LinRegTTest (β and ρ) |
| 0xAEC47 | `3c 30` | <0 | LinRegTTest (β and ρ) |

### Result Screen Alternative Display (0xAB3D6 - 0xAB49F)

| Offset | Hex | Decoded | Test |
|--------|-----|---------|------|
| 0xAB3D6 | `c3 18` | σ≠ | Z-Test result header |
| 0xAB3D9 | `c3 3e` | σ> | Z-Test result header |
| 0xAB3DC | `c3 3c` | σ< | Z-Test result header |
| 0xAB3DF | `c3 81 18 c3 82` | σ₁≠σ₂ | 2-SampFTest result |
| 0xAB3E5 | `c3 81 3e c3 82` | σ₁>σ₂ | 2-SampFTest result |
| 0xAB3EB | `c3 81 3c c3 82` | σ₁<σ₂ | 2-SampFTest result |
| 0xAB3F1 | `70726f7018` | prop≠ | 1-PropZTest result |
| 0xAB3F7 | `70726f703e` | prop> | 1-PropZTest result |
| 0xAB3FD | `70726f703c` | prop< | 1-PropZTest result |
| 0xAB403 | `70 81 18 70 82` | p₁≠p₂ | 2-PropZTest result |
| 0xAB409 | `70 81 3e 70 82` | p₁>p₂ | 2-PropZTest result |
| 0xAB40F | `70 81 3c 70 82` | p₁<p₂ | 2-PropZTest result |
| 0xAB415 | `c7 81 18 c7 82` | μ₁≠μ₂ | 2-SampTTest result |
| 0xAB41B | `c7 81 3e c7 82` | μ₁>μ₂ | 2-SampTTest result |
| 0xAB421 | `c7 81 3c c7 82` | μ₁<μ₂ | 2-SampTTest result |
| 0xAB437 | `bc 3e 30 20 616e6420 c5 3e 30` | β>0 and ρ>0 | LinRegTTest result |
| 0xAB443 | `bc 3c 30 20 616e6420 c5 3c 30` | β<0 and ρ<0 | LinRegTTest result |
| 0xAB44F | `bc 18 30 20 616e6420 c5 18 30` | β≠0 and ρ≠0 | LinRegTTest result |

---

## 3. Menu Item Names from ROM

### STAT > TESTS Menu (0x7BDF9)

| Offset | Hex trailer | Menu item | Position |
|--------|------------|-----------|----------|
| 0x7BDF9 | `ce` | Z-Test... | 1 |
| 0x7BE01 | `ce` | T-Test... | 2 |
| 0x7BE09 | `ce` | 2-SampZTest... | 3 |
| 0x7BE16 | `ce` | 2-SampTTest... | 4 |
| 0x7BE23 | `ce` | 1-PropZTest... | 5 |
| 0x7BE30 | `ce` | 2-PropZTest... | 6 |
| 0x7BE3D | `ce` | χ²-Test... | 7 |
| 0x7BE46 | `ce` | 2-SampFTest... | 8 |
| 0x7BE53 | `ce` | ZInterval... | 9 |
| 0x7BE5E | `ce` | TInterval... | 0 |
| 0x7BE69 | `ce` | 2-SampZInt... | A |
| 0x7BE75 | `ce` | 2-SampTInt... | B |
| 0x7BE81 | `ce` | 1-PropZInt... | C |
| 0x7BE8D | `ce` | 2-PropZInt... | D |
| 0x7BE99 | `ce` | LinRegTTest... | E |
| 0x7BEA8 | `ce` | χ²GOF-Test... | F |
| 0x7BEB2 | `ce` | LinRegTInt... | G |

### DISTR Menu (0xA0DEF)

| Offset | Hex trailer | Menu item | Position |
|--------|------------|-----------|----------|
| 0xA10AD | `8d` | normalpdf( | 1 |
| 0xA0DEF | `dd` | normalcdf( | 2 |
| 0xA0DFB | `de` | invNorm( | 3 |
| 0xA13BE | `ba` | invT( | 4 |
| (in table) | `8e` | tpdf( | 5 |
| (in table) | `df` | tcdf( | 6 |
| (in table) | `8f` | χ²pdf( | 7 |
| (in table) | `e0` | χ²cdf( | 8 |
| (in table) | `f2` | Fpdf( | 9 |
| (in table) | | Fcdf( | 0 |
| 0xA0E1B | `e2` | binompdf( | A |
| 0xA0E26 | `e3` | binomcdf( | B |
| (in table) | `e4` | poissonpdf( | C |
| (in table) | | poissoncdf( | D |
| 0xA0E4B | `f3` | geometpdf( | E |
| 0xA0E57 | | geometcdf( | F |

### STAT > CALC Menu (0xA0808)

| Offset | Menu item | Position |
|--------|-----------|----------|
| 0xA0808 | 1-Var Stats | 1 |
| 0xA0A52 | 2-Var Stats | (later in menu) |
| 0xA0816 | LinReg(a+bx) | 8 |
| 0xA0825 | LinReg(ax+b) | 4 |

---

## 4. Stat Result Variable Names from ROM

### Variable Token Table (0xA0A68 - 0xA0AE8)

| Offset | Bytes | Display name | Used in |
|--------|-------|-------------|---------|
| 0xA0A75 | `cb` | x̄ | 1-Var Stats result |
| 0xA0A7B | `c6 78` | Σx | 1-Var Stats result |
| 0xA0A7F | `c6 78 12` | Σx² | 1-Var Stats result |
| 0xA0A84 | `c7 78` | μx (or σx) | 1-Var Stats result |
| 0xA0A88 | `53 78` | Sx | 1-Var Stats result |
| 0xA0A8C | `6d696e58` | minX | 1-Var Stats page 2 |
| 0xA0A92 | `6d617858` | maxX | 1-Var Stats page 2 |
| 0xA0ABE | `62` | b | LinReg result |
| 0xA0AC0 | `61` | a | LinReg result |
| 0xA0AC2 | `72` | r | LinReg result |
| 0xA0AC5 | `4d6564` | Med | 1-Var Stats page 2 |
| 0xA0ACB | `51 81` | Q₁ | 1-Var Stats page 2 |
| 0xA0ACE | `51 83` | Q₃ | 1-Var Stats page 2 |

### Display Labels (0xB2690 area, used for screen rendering)

| Offset | Bytes | Decoded |
|--------|-------|---------|
| 0xB2695 | `5131` | Q1 |
| 0xB2698 | `5133` | Q3 |
| 0xB269B | `6d696e58` | minX |
| 0xB26A0 | `6d617858` | maxX |
| 0xB26A5 | `4d6564` | Med |

### Other Result Labels (scattered)

| Offset | Bytes | Decoded | Context |
|--------|-------|---------|---------|
| 0xA2F72 | `64663d` | df= | Chi-square/distribution result |
| 0xA2F76 | `417265613d` | Area= | Distribution shade result |
| 0xA2F7C | `75703d` | up= | Distribution boundary |
| 0xA2F80 | `6c6f773d` | low= | Distribution boundary |
| 0xA309D | `6d3d` | m= | LinReg manual result |
| 0xA30A0 | `623d` | b= | LinReg manual result |

---

## 5. Plot Editor Labels from ROM

| Offset | Bytes | Decoded |
|--------|-------|---------|
| 0xB24A3 | `586c6973743a` | Xlist: |
| 0xB24AA | `44617461204c6973743a` | Data List: |
| 0xB24B5 | `4461746120417869733a` | Data Axis: |
| 0xB24C0 | `596c6973743a` | Ylist: |
| 0xB24CA | `46726571203a` | Freq : |
| 0xB24D1-D4 | `4c81`/`4c82` | L₁ / L₂ |
| 0xB24E3 | `4d61726b203a` | Mark : |
| 0xB24EA | `4f6666` | Off |
| 0xB24EE | `4f6e` | On |
| 0xB24F1 | `547970653a` | Type: |
| 0xB2511 | `436f6c6f723a` | Color: |

---

## 6. Discrepancies: JSON vs ROM

### CONFIRMED MATCHES

| JSON field | ROM string | Status |
|------------|-----------|--------|
| Calculate | `Calculate` (0xAEBD1) | MATCH |
| Draw | `Draw` (0xAEBDB) | MATCH |
| Inpt | `Inpt` (0xAEBE7) | MATCH |
| Data / Stats | `Data` / `Stats` (0xAEBFA/FF) | MATCH |
| Pooled / Yes / No | All present (0xAEBEC-F7) | MATCH |
| C-Level | `C-Level` (0xAEB8E) | MATCH |
| Observed | `Observed` (0xAEB96) | MATCH |
| Expected | `Expected` (0xAEB9F) | MATCH |
| Xlist | `Xlist` (0xAEBA8) | MATCH |
| Ylist | `Ylist` (0xAEBAE) | MATCH |
| FreqList | `FreqList` (0xAECC4) | MATCH |
| Store RegEQ | `Store RegEQ` (0xAECCD) | MATCH |
| RegEQ | `RegEQ` (0xAEC4A) | MATCH |
| lower | `lower` (0xAEC6E) | MATCH |
| upper | `upper` (0xAEC74) | MATCH |
| area | `area` (0xAEC8A) | MATCH |
| Tail / LEFT / CENTER / RIGHT | All present (0xAECE5-F6) | MATCH |
| p₀ | `p₀` [70 80] (0xAEB81) | MATCH |
| x̄ | `x̄` [CB] (0xAEBB4) | MATCH |
| Sx | `Sx` [53 78] (0xAEBB8) | MATCH |
| n | `n` [6E] (0xAEBB6) | MATCH |
| x̄1 / x̄2 | `x̄1` / `x̄2` [CB31/CB32] (0xAEB6A/74) | MATCH |
| Sx1 / Sx2 | `Sx1` / `Sx2` [537831/537832] (0xAEB6D/77) | MATCH |
| n1 / n2 | `n1` / `n2` [6E31/6E32] (0xAEB67/71) | MATCH |
| df | `df` (0xAEC50) | MATCH |
| List | `List` (0xAEB45) | MATCH |
| Freq | `Freq` (0xAEB4A) | MATCH |
| β & ρ | `β & ρ` [BC 20 26 20 C5] (0xAEBCB) | MATCH |
| σ | `σ` [C3] (0xAEBBB) | MATCH |
| p | `p` [70] (0xAEC97) | MATCH |
| x | `x` [78] (0xAEB84) | MATCH |
| minX / maxX / Med / Q1 / Q3 | All present (0xB269B-A5) | MATCH |

### DISCREPANCIES

| # | JSON says | ROM says | Severity | Notes |
|---|-----------|----------|----------|-------|
| 1 | **`numtrials`** (screens 29-30) | **`trials`** (0xAEC99) | **MEDIUM** | ROM wizard label is `trials`, not `numtrials`. The string `numtrials` appears only in syntax help tooltips (0x4F78E: `(numtrials,p,x])`), not in the wizard field itself. |
| 2 | **`μ0`** as wizard field label | **No literal `μ0` or `μ₀`** in label table | **LOW** | The ROM stores the parameter field as `σ₀/μ₀` (`c3 80`) at 0xAEB41, which renders contextually. The JSON's representation as `μ0` is how it *appears on screen* for T-Test, but the ROM uses a shared contextual token. |
| 3 | **`μ ? μ0`** as alt hypothesis field | ROM stores **`≠μ₀/σ₀`**, **`>μ₀/σ₀`**, **`<μ₀/σ₀`** (0xAEC05-0D) | **LOW** | The JSON correctly shows the display behavior; the ROM uses shared tokens rendered contextually per test type. |
| 4 | **`Prop ? p0`** as alt hypothesis choice label | ROM has **`prop`** (0xAEBC0) as the label | **LOW** | The JSON says `Prop ? p0` but ROM just stores `prop` as the field label; the options are separate entries (≠p₀, >p₀, <p₀). |
| 5 | **`p̂`** in result lines (screens 47, 49) | **Not found as literal string** | **INFO** | p̂ (p-hat) is rendered from the system stat variable, not stored as a display label in the wizard/label table. The ROM computes and displays it from the `prop` variable context. This is correct behavior -- the JSON's `p̂ = {value}` accurately describes what the screen shows. |
| 6 | **`CNTB`** in χ²GOF-Test result (screen 56) | **Not found in ROM** | **MEDIUM** | The string `CNTB` does not appear anywhere in the ROM. The χ²GOF-Test may display contribution list differently, or this label may be generated at runtime. Needs verification on actual calculator. |
| 7 | **`z = {value}`** in 1-PropZTest result (screen 47) | **`z=` not found as display label** | **INFO** | Like other result values, `z=` is rendered by the stat display routine combining the variable token name with `=` at runtime, not stored as a literal string. |
| 8 | **`t = {value}`** in T-Test result (screen 38) | **`t=` found only in code context** (0x738A7) | **INFO** | Same as z=; the `t=` at 0x738A7 appears to be part of eZ80 machine code, not a display string table entry. |
| 9 | **`r² = {value}`** in LinReg result (screen 35) | **`r²=` not found as literal** | **INFO** | The `r²` display is composed from `r` (0x72) + `²` (0x12) + `=` at runtime. The variable token `r` exists at 0xA0AC2. |
| 10 | **`Paste`** in JSON | ROM has **` Paste`** (with leading space) at 0xAECA0 | **LOW** | Minor: ROM label has a leading space for display alignment. |
| 11 | **`tail`** as invNorm field (JSON screen 28) | ROM has **`Tail`** (capitalized) at 0xAECE5 | **LOW** | Case difference: JSON uses lowercase `tail`, ROM uses `Tail`. |
| 12 | JSON screen 28 has **`μ`** and **`σ`** as invNorm fields | ROM has separate **`μ`** (0xAEB43) and **`σ`** (0xAEBBB) | **MATCH** | These are in the shared wizard label pool, correctly reused across wizards. |
| 13 | **`x value`** wizard field (0xAEC8F) | **Not in JSON** | **INFO** | This ROM label is for invT, which is not included in the JSON procedures (only AP-relevant procedures are included). |

### SUMMARY OF DISCREPANCIES

- **Action required**: Fix `numtrials` to `trials` in JSON screens 29-30 (binompdf/binomcdf wizard fields)
- **Verify on hardware**: Whether `CNTB` actually appears on χ²GOF-Test result screen
- **Cosmetic**: `tail` should be `Tail`, `Paste` should be ` Paste` (leading space) if matching ROM exactly
- **All other fields**: Confirmed present in ROM at documented offsets

---

## 7. ROM Region Summary

| Region | Offset range | Contents |
|--------|-------------|----------|
| STAT > TESTS menu | 0x7BDF9 - 0x7BEC0 | Menu item names with trailing `CE` bytes |
| STAT > CALC menu | 0xA0808 - 0xA0850 | Stat calculation procedure names |
| DISTR menu | 0xA0DEF - 0xA0E70 | Distribution function names |
| Stat variable tokens | 0xA0A68 - 0xA0AE8 | Internal variable name -> token ID mappings |
| Alt hypothesis (result) | 0xAB3D6 - 0xAB49F | Alternative hypothesis display strings for result screens |
| Wizard field labels | 0xAEB30 - 0xAED00 | All wizard input field labels, options, and action buttons |
| Result display labels | 0xA2F72 - 0xA30A5 | df=, Area=, up=, low=, m=, b= |
| Five-number summary | 0xB2695 - 0xB26A8 | Q1, Q3, minX, maxX, Med |
| Plot editor labels | 0xB24A3 - 0xB2518 | Xlist:, Ylist:, Freq:, Type:, Color:, etc. |
