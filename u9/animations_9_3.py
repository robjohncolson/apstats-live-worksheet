"""
AP Statistics 9.3 — Justifying a Claim About the Slope
Based on a Confidence Interval

Four Manim CE scenes. No LaTeX — uses Text() with Unicode only.
"""

from manim import *
import numpy as np

# ── colour palette ──────────────────────────────────────────────
BLUE_ACCENT  = "#58C4DD"
RED_ACCENT   = "#FC6255"
GREEN_ACCENT = "#83C167"
YELLOW_ACC   = "#FFFF00"
ORANGE_ACC   = "#FF8C00"
GREY_DARK    = "#444444"


# ================================================================
# Scene 1: Interpreting a CI for Slope
# ================================================================
class InterpretingCIForSlope(Scene):
    def construct(self):
        # Title
        title = Text("Interpreting a CI for the Slope", font_size=40, color=BLUE_ACCENT)
        title.to_edge(UP, buff=0.4)
        self.play(Write(title))
        self.wait(0.5)

        # --- number line ---
        nline = NumberLine(
            x_range=[-2, 18, 2],
            length=10,
            include_numbers=True,
            font_size=24,
            include_tip=True,
        ).shift(UP * 1.0)
        self.play(Create(nline), run_time=1)

        # CI bracket  (-0.55, 16.13)
        left_val, right_val = -0.55, 16.13
        left_pt  = nline.n2p(left_val)
        right_pt = nline.n2p(right_val)

        ci_line = Line(left_pt, right_pt, stroke_width=6, color=GREEN_ACCENT)
        left_tick  = Line(UP * 0.2, DOWN * 0.2, color=GREEN_ACCENT).move_to(left_pt)
        right_tick = Line(UP * 0.2, DOWN * 0.2, color=GREEN_ACCENT).move_to(right_pt)

        ci_label = Text("(-0.55, 16.13)", font_size=22, color=GREEN_ACCENT)
        ci_label.next_to(ci_line, UP, buff=0.15)

        self.play(
            Create(ci_line), Create(left_tick), Create(right_tick),
            FadeIn(ci_label),
            run_time=1.2,
        )
        self.wait(0.6)

        # Interpretation template
        interp_lines = [
            'We are  95%  confident that the interval',
            'from  -0.55  to  16.13  captures the',
            'true slope of the population regression line',
            'relating eruption duration to interval.',
        ]
        interp_group = VGroup(*[
            Text(line, font_size=26) for line in interp_lines
        ]).arrange(DOWN, buff=0.18, aligned_edge=LEFT).shift(DOWN * 1.4)

        # Highlight key pieces
        # "95%" highlight
        interp_group[0][6:9].set_color(YELLOW_ACC)
        # "-0.55" highlight
        interp_group[1][5:10].set_color(GREEN_ACCENT)
        # "16.13" highlight
        interp_group[1][14:19].set_color(GREEN_ACCENT)
        # "true slope" highlight
        interp_group[2][0:10].set_color(RED_ACCENT)

        for line in interp_group:
            self.play(FadeIn(line, shift=RIGHT * 0.3), run_time=0.7)
        self.wait(0.5)

        # Callout box
        box = SurroundingRectangle(interp_group, color=BLUE_ACCENT, buff=0.2, corner_radius=0.1)
        self.play(Create(box))
        self.wait(1.5)

        # Confidence-level note
        note = Text(
            "If we repeated sampling many times,\n"
            "about 95% of intervals would capture\n"
            "the true slope.",
            font_size=22, color=GREY_DARK,
        ).next_to(box, DOWN, buff=0.3)
        note.set_color(WHITE)
        self.play(FadeIn(note, shift=UP * 0.2))
        self.wait(2)
        self.play(*[FadeOut(m) for m in self.mobjects])


# ================================================================
# Scene 2: Does Zero Matter?
# ================================================================
class DoesZeroMatter(Scene):
    def construct(self):
        title = Text("Does the Interval Contain 0?", font_size=40, color=BLUE_ACCENT)
        title.to_edge(UP, buff=0.4)
        self.play(Write(title))
        self.wait(0.5)

        # --- Case A: interval CONTAINS 0 ---
        label_a = Text("Case A: Interval contains 0", font_size=26, color=ORANGE_ACC)
        label_a.move_to(UP * 2.0 + LEFT * 0.0).shift(DOWN * 0.6)

        nline_a = NumberLine(
            x_range=[-4, 4, 1], length=8,
            include_numbers=True, font_size=20, include_tip=True,
        ).shift(UP * 0.7)

        # interval (-1.5, 2.5)
        la, ra = -1.5, 2.5
        ci_a = Line(nline_a.n2p(la), nline_a.n2p(ra), stroke_width=6, color=RED_ACCENT)
        zero_dot_a = Dot(nline_a.n2p(0), color=YELLOW_ACC, radius=0.1)
        zero_label_a = Text("0", font_size=20, color=YELLOW_ACC).next_to(zero_dot_a, UP, buff=0.15)

        conclusion_a = Text(
            "0 is a plausible value for the slope.\n"
            "NOT convincing evidence of a linear relationship.",
            font_size=22, color=RED_ACCENT,
        ).next_to(nline_a, DOWN, buff=0.35)

        self.play(FadeIn(label_a), Create(nline_a), run_time=0.8)
        self.play(Create(ci_a), FadeIn(zero_dot_a), FadeIn(zero_label_a), run_time=0.8)
        self.wait(0.3)
        self.play(FadeIn(conclusion_a, shift=UP * 0.2), run_time=0.8)
        self.wait(1.2)

        # shift everything up and fade slightly
        group_a = VGroup(label_a, nline_a, ci_a, zero_dot_a, zero_label_a, conclusion_a)
        self.play(group_a.animate.shift(UP * 1.5).scale(0.7).set_opacity(0.45), run_time=0.8)

        # --- Case B: interval ALL POSITIVE ---
        label_b = Text("Case B: Interval entirely above 0", font_size=26, color=GREEN_ACCENT)
        label_b.move_to(DOWN * 0.3)

        nline_b = NumberLine(
            x_range=[-1, 5, 1], length=8,
            include_numbers=True, font_size=20, include_tip=True,
        ).shift(DOWN * 1.2)

        lb, rb = 1.0, 3.5
        ci_b = Line(nline_b.n2p(lb), nline_b.n2p(rb), stroke_width=6, color=GREEN_ACCENT)
        zero_dot_b = Dot(nline_b.n2p(0), color=YELLOW_ACC, radius=0.1)
        zero_label_b = Text("0", font_size=20, color=YELLOW_ACC).next_to(zero_dot_b, UP, buff=0.15)

        conclusion_b = Text(
            "0 is NOT in the interval.\n"
            "Convincing evidence of a POSITIVE linear relationship.",
            font_size=22, color=GREEN_ACCENT,
        ).next_to(nline_b, DOWN, buff=0.35)

        self.play(FadeIn(label_b), Create(nline_b), run_time=0.8)
        self.play(Create(ci_b), FadeIn(zero_dot_b), FadeIn(zero_label_b), run_time=0.8)
        self.wait(0.3)
        self.play(FadeIn(conclusion_b, shift=UP * 0.2), run_time=0.8)
        self.wait(2)
        self.play(*[FadeOut(m) for m in self.mobjects])


# ================================================================
# Scene 3: Three Intervals Compared
# ================================================================
class ThreeIntervalsCompared(Scene):
    def construct(self):
        title = Text("Three Intervals — Three Conclusions", font_size=38, color=BLUE_ACCENT)
        title.to_edge(UP, buff=0.35)
        self.play(Write(title))
        self.wait(0.5)

        # Configuration for the three intervals
        configs = [
            {
                "name": "Old Faithful",
                "lo": -0.55, "hi": 16.13,
                "x_range": [-4, 20, 4],
                "color": RED_ACCENT,
                "conclusion": "Contains 0 -> No convincing evidence",
                "y_shift": 1.5,
            },
            {
                "name": "Raoul's Airplanes",
                "lo": 0.013, "hi": 0.080,
                "x_range": [-0.04, 0.12, 0.02],
                "color": GREEN_ACCENT,
                "conclusion": "All positive -> Convincing evidence (+)",
                "y_shift": -0.2,
            },
            {
                "name": "Hypothetical (negative)",
                "lo": -5.2, "hi": -1.8,
                "x_range": [-8, 2, 2],
                "color": "#C77DFF",
                "conclusion": "All negative -> Convincing evidence (-)",
                "y_shift": -1.9,
            },
        ]

        all_groups = []
        for cfg in configs:
            # Label
            lbl = Text(cfg["name"], font_size=24, color=cfg["color"])
            lbl.move_to(UP * cfg["y_shift"] + LEFT * 4.5)

            # Number line
            nl = NumberLine(
                x_range=cfg["x_range"],
                length=7.5,
                include_numbers=True,
                font_size=18,
                include_tip=True,
            )
            nl.move_to(UP * (cfg["y_shift"] - 0.5))

            # Zero marker
            zero_pos = nl.n2p(0)
            zero_dot = Dot(zero_pos, color=YELLOW_ACC, radius=0.08)

            # CI bar
            ci = Line(
                nl.n2p(cfg["lo"]), nl.n2p(cfg["hi"]),
                stroke_width=5, color=cfg["color"],
            )

            # Conclusion text
            conc = Text(cfg["conclusion"], font_size=20, color=cfg["color"])
            conc.next_to(nl, DOWN, buff=0.12)

            grp = VGroup(lbl, nl, zero_dot, ci, conc)
            all_groups.append((lbl, nl, zero_dot, ci, conc))

        for lbl, nl, zd, ci, conc in all_groups:
            self.play(FadeIn(lbl), Create(nl), FadeIn(zd), run_time=0.7)
            self.play(Create(ci), run_time=0.6)
            self.play(FadeIn(conc, shift=UP * 0.15), run_time=0.5)
            self.wait(0.6)

        # Highlight the rule
        rule = Text(
            "KEY RULE:  If the CI contains 0, slope could be 0 (no evidence).\n"
            "If entirely positive or negative, convincing evidence of a relationship.",
            font_size=22, color=YELLOW_ACC,
        ).to_edge(DOWN, buff=0.3)
        box = SurroundingRectangle(rule, color=YELLOW_ACC, buff=0.15, corner_radius=0.1)
        self.play(FadeIn(rule), Create(box))
        self.wait(3)
        self.play(*[FadeOut(m) for m in self.mobjects])


# ================================================================
# Scene 4: Real Estate — Start to Finish
# ================================================================
class RealEstateCalculation(Scene):
    def construct(self):
        title = Text("Real Estate Example — Building the CI", font_size=38, color=BLUE_ACCENT)
        title.to_edge(UP, buff=0.35)
        self.play(Write(title))
        self.wait(0.5)

        # Step 1: Given values
        given_header = Text("From computer output:", font_size=26, color=ORANGE_ACC)
        given_header.move_to(UP * 2.2 + LEFT * 2.5)

        givens = VGroup(
            Text("b = -2.158  (slope estimate)", font_size=24),
            Text("SE(b) = 0.149", font_size=24),
            Text("df = 18      t* = 2.101  (95%)", font_size=24),
        ).arrange(DOWN, buff=0.15, aligned_edge=LEFT)
        givens.next_to(given_header, DOWN, buff=0.25, aligned_edge=LEFT)

        self.play(FadeIn(given_header))
        for g in givens:
            self.play(FadeIn(g, shift=RIGHT * 0.2), run_time=0.5)
        self.wait(0.8)

        # Step 2: Margin of error
        me_header = Text("Margin of error:", font_size=26, color=ORANGE_ACC)
        me_header.next_to(givens, DOWN, buff=0.5, aligned_edge=LEFT)

        me_calc = Text("ME = t* x SE(b) = 2.101 x 0.149 = 0.313", font_size=24, color=GREEN_ACCENT)
        me_calc.next_to(me_header, DOWN, buff=0.15, aligned_edge=LEFT)

        self.play(FadeIn(me_header), run_time=0.4)
        self.play(FadeIn(me_calc, shift=RIGHT * 0.2), run_time=0.7)
        self.wait(0.8)

        # Step 3: Build interval
        ci_header = Text("Confidence interval:", font_size=26, color=ORANGE_ACC)
        ci_header.next_to(me_calc, DOWN, buff=0.5, aligned_edge=LEFT)

        ci_calc = VGroup(
            Text("b +/- ME  =  -2.158 +/- 0.313", font_size=24),
            Text("= (-2.471, -1.845)", font_size=28, color=YELLOW_ACC),
        ).arrange(DOWN, buff=0.12, aligned_edge=LEFT)
        ci_calc.next_to(ci_header, DOWN, buff=0.15, aligned_edge=LEFT)

        self.play(FadeIn(ci_header), run_time=0.4)
        self.play(FadeIn(ci_calc[0], shift=RIGHT * 0.2), run_time=0.6)
        self.play(FadeIn(ci_calc[1], shift=RIGHT * 0.2), run_time=0.6)
        self.wait(1.0)

        # Shrink and move everything up
        top_group = VGroup(given_header, givens, me_header, me_calc, ci_header, ci_calc)
        self.play(top_group.animate.scale(0.6).to_edge(UP, buff=0.5).shift(LEFT * 1.5), run_time=0.8)

        # Step 4: Number line
        nline = NumberLine(
            x_range=[-3.5, 0.5, 0.5],
            length=10,
            include_numbers=True,
            font_size=20,
            include_tip=True,
        ).shift(DOWN * 0.5)
        self.play(Create(nline), run_time=0.8)

        # CI bar
        lo, hi = -2.471, -1.845
        ci_bar = Line(nline.n2p(lo), nline.n2p(hi), stroke_width=7, color=YELLOW_ACC)
        lo_tick = Line(UP * 0.15, DOWN * 0.15, color=YELLOW_ACC).move_to(nline.n2p(lo))
        hi_tick = Line(UP * 0.15, DOWN * 0.15, color=YELLOW_ACC).move_to(nline.n2p(hi))
        ci_text = Text("(-2.471, -1.845)", font_size=20, color=YELLOW_ACC)
        ci_text.next_to(ci_bar, UP, buff=0.15)

        self.play(Create(ci_bar), Create(lo_tick), Create(hi_tick), FadeIn(ci_text), run_time=0.8)
        self.wait(0.5)

        # Mark zero
        zero_pos = nline.n2p(0)
        zero_dot = Dot(zero_pos, color=RED_ACCENT, radius=0.1)
        zero_lbl = Text("0", font_size=20, color=RED_ACCENT).next_to(zero_dot, UP, buff=0.15)
        self.play(FadeIn(zero_dot), FadeIn(zero_lbl))
        self.wait(0.3)

        # Zero conclusion
        zero_note = Text(
            "0 is NOT in the interval -> all negative.\n"
            "Convincing evidence of a NEGATIVE relationship.",
            font_size=22, color=GREEN_ACCENT,
        ).shift(DOWN * 1.6)
        self.play(FadeIn(zero_note, shift=UP * 0.2))
        self.wait(1.0)

        # Mark agent's claim: -2
        claim_pos = nline.n2p(-2)
        claim_dot = Dot(claim_pos, color=ORANGE_ACC, radius=0.12)
        claim_lbl = Text("-2 (agent's claim)", font_size=20, color=ORANGE_ACC)
        claim_lbl.next_to(claim_dot, DOWN, buff=0.25)
        arrow = Arrow(claim_lbl.get_top(), claim_dot.get_bottom(), buff=0.05, color=ORANGE_ACC)

        self.play(FadeIn(claim_dot), GrowArrow(arrow), FadeIn(claim_lbl), run_time=0.8)
        self.wait(0.5)

        claim_concl = Text(
            "-2 IS inside the interval.\n"
            "The data do not contradict the agent's belief.",
            font_size=22, color=ORANGE_ACC,
        ).shift(DOWN * 2.7)
        self.play(FadeIn(claim_concl, shift=UP * 0.2))
        self.wait(3)
        self.play(*[FadeOut(m) for m in self.mobjects])
