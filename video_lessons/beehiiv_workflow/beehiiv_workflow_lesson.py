"""
Fin Quote to Beehiiv: a diagram-first explanation of the daily newsletter flow.

Generate narration:
  ./gen_audio.sh

Render:
  ~/Library/Python/3.9/bin/manim -qh beehiiv_workflow_lesson.py BeehiivWorkflowLesson

Mux:
  ffmpeg -i media/videos/beehiiv_workflow_lesson/1080p60/BeehiivWorkflowLesson.mp4 \
    -i audio/narration.mp3 -c:v copy -c:a aac -shortest \
    Fin_Quote_to_Beehiiv_Explainer.mp4
"""
import json
import os

import numpy as np
from manim import *

DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(DIR, "durations.json"), encoding="utf-8") as handle:
    DURS = json.load(handle)

FONT = "Avenir Next"

INK = "#17211A"
MUTED = "#647067"
BG = "#F7F9F6"
WHITE = "#FFFFFF"
LINE = "#D8DED8"
SAGE = "#596B4A"
GREEN = "#2E7D52"
LIGHT_GREEN = "#E8F3EB"
GOLD = "#C89536"
LIGHT_GOLD = "#FBF2DE"
PURPLE = "#7656A8"
LIGHT_PURPLE = "#F0EAF8"
BLUE = "#35698A"
LIGHT_BLUE = "#E8F1F6"
RED = "#B6473C"
LIGHT_RED = "#F8EAE8"


def txt(value, size=24, color=INK, weight=NORMAL, **kwargs):
    return Text(
        value,
        font=FONT,
        font_size=size,
        color=color,
        weight=weight,
        line_spacing=0.8,
        **kwargs,
    )


def fit(mob, width=None, height=None):
    if width and mob.width > width:
        mob.scale_to_fit_width(width)
    if height and mob.height > height:
        mob.scale_to_fit_height(height)
    return mob


def card(width, height, fill=WHITE, stroke=LINE, radius=0.16):
    return RoundedRectangle(
        width=width,
        height=height,
        corner_radius=radius,
        fill_color=fill,
        fill_opacity=1,
        stroke_color=stroke,
        stroke_width=1.6,
    )


def pill(label, color, fill_color, size=18, pad=0.24):
    label_mob = txt(label, size=size, color=color, weight=BOLD)
    shell = RoundedRectangle(
        width=label_mob.width + pad * 2,
        height=label_mob.height + 0.2,
        corner_radius=0.16,
        fill_color=fill_color,
        fill_opacity=1,
        stroke_color=color,
        stroke_width=1.4,
    )
    label_mob.move_to(shell)
    return VGroup(shell, label_mob)


def arrow_between(left, right, color=SAGE):
    return Arrow(
        left.get_right(),
        right.get_left(),
        buff=0.16,
        color=color,
        stroke_width=4,
        tip_length=0.2,
    )


class BeehiivWorkflowLesson(Scene):
    def begin(self, key):
        self._budget = float(DURS[key])
        self._used = 0.0

    def P(self, *animations, run_time=1.0, **kwargs):
        self.play(*animations, run_time=run_time, **kwargs)
        self._used += run_time

    def W(self, duration):
        self.wait(duration)
        self._used += duration

    def end(self):
        remaining = self._budget - self._used
        if remaining > 0.05:
            self.wait(remaining)

    def clear_stage(self, *keep):
        retained = set(keep)
        removable = [mob for mob in self.mobjects if mob not in retained]
        if removable:
            self.P(*[FadeOut(mob) for mob in removable], run_time=0.7)

    def construct(self):
        self.camera.background_color = BG
        self.header = self.make_header()
        self.s1_overview()
        self.s2_morning_engine()
        self.s3_one_click()
        self.s4_connection()
        self.s5_guardrails()
        self.s6_daily_routine()

    def make_header(self):
        bar = Rectangle(
            width=14.4,
            height=0.66,
            fill_color=INK,
            fill_opacity=1,
            stroke_width=0,
        ).to_edge(UP, buff=0)
        accent = Rectangle(
            width=14.4,
            height=0.06,
            fill_color=SAGE,
            fill_opacity=1,
            stroke_width=0,
        ).next_to(bar, DOWN, buff=0)
        brand = txt("THE INTRADAY", size=18, color=WHITE, weight=BOLD)
        lesson = txt("Fin Quote to Beehiiv", size=18, color="#DDE4DA", weight=MEDIUM)
        brand.move_to(bar.get_center() + LEFT * 4.9)
        lesson.move_to(bar.get_center() + RIGHT * 4.7)
        return VGroup(bar, accent, brand, lesson)

    def section_title(self, eyebrow, title, subtitle=None):
        eye = txt(eyebrow.upper(), size=17, color=SAGE, weight=BOLD)
        heading = txt(title, size=34, color=INK, weight=BOLD)
        group = VGroup(eye, heading).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
        if subtitle:
            sub = fit(txt(subtitle, size=19, color=MUTED), width=11.8)
            group.add(sub)
            sub.next_to(heading, DOWN, aligned_edge=LEFT, buff=0.16)
        group.to_edge(LEFT, buff=0.7).to_edge(UP, buff=0.96)
        return group

    def report_card(self):
        shell = card(4.05, 3.55)
        label = pill("MORNING REVIEW", SAGE, LIGHT_GREEN, size=15)
        title = txt("LII: Why it is moving", size=24, color=INK, weight=BOLD)
        line1 = Rectangle(
            width=3.2, height=0.12, fill_color=LINE, fill_opacity=1, stroke_width=0
        )
        line2 = Rectangle(
            width=2.7, height=0.12, fill_color=LINE, fill_opacity=1, stroke_width=0
        )
        stats = VGroup(
            pill("+18.4%", GREEN, LIGHT_GREEN, size=16),
            pill("8 sources", BLUE, LIGHT_BLUE, size=16),
        ).arrange(RIGHT, buff=0.2)
        chart_axes = Axes(
            x_range=[0, 5, 1],
            y_range=[0, 4, 1],
            x_length=3.0,
            y_length=1.0,
            axis_config={"stroke_color": LINE, "stroke_width": 1.5, "include_ticks": False},
            tips=False,
        )
        plot = chart_axes.plot(
            lambda x: 0.45 + 0.23 * x + 0.22 * np.sin(2.4 * x),
            x_range=[0, 5],
            color=GREEN,
            stroke_width=4,
        )
        contents = VGroup(label, title, line1, line2, stats, VGroup(chart_axes, plot))
        contents.arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        contents.move_to(shell)
        fit(contents, width=3.45, height=3.05)
        return VGroup(shell, contents)

    def beehiiv_card(self):
        shell = card(4.05, 3.55, fill="#FCFAFF", stroke="#DCD3EA")
        label = pill("BEEHIIV DRAFT", PURPLE, LIGHT_PURPLE, size=15)
        subject = txt("The move behind LII", size=24, color=INK, weight=BOLD)
        preview = txt("Preview text and email body", size=17, color=MUTED)
        editor = card(3.2, 1.3, fill=WHITE, stroke="#DDD5E8")
        blocks = VGroup(
            Rectangle(width=2.55, height=0.1, fill_color=LINE, fill_opacity=1, stroke_width=0),
            Rectangle(width=2.2, height=0.1, fill_color=LINE, fill_opacity=1, stroke_width=0),
            Rectangle(width=2.7, height=0.1, fill_color=LINE, fill_opacity=1, stroke_width=0),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.17).move_to(editor)
        draft = pill("DRAFT - NOT SENT", RED, LIGHT_RED, size=15)
        contents = VGroup(label, subject, preview, VGroup(editor, blocks), draft)
        contents.arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        contents.move_to(shell)
        fit(contents, width=3.45, height=3.05)
        return VGroup(shell, contents)

    def s1_overview(self):
        self.begin("s1")
        title = txt("One click from report to email draft", size=46, color=INK, weight=BOLD)
        title.move_to(UP * 2.35)
        subtitle = txt(
            "Fin Quote prepares and transfers. Beehiiv reviews and delivers.",
            size=24,
            color=MUTED,
        ).next_to(title, DOWN, buff=0.2)
        left = self.report_card().move_to(LEFT * 3.5 + DOWN * 0.35)
        right = self.beehiiv_card().move_to(RIGHT * 3.5 + DOWN * 0.35)
        bridge = arrow_between(left, right, color=SAGE)
        button = pill("SEND TO BEEHIIV", WHITE, SAGE, size=17, pad=0.34)
        button.move_to(bridge.get_center() + UP * 0.58)
        cursor = Triangle(
            color=INK,
            fill_color=WHITE,
            fill_opacity=1,
            stroke_width=2,
        ).scale(0.13).rotate(-PI / 4).next_to(button, DOWN, buff=0.04)

        self.P(Write(title), run_time=1.5)
        self.P(FadeIn(subtitle, shift=UP * 0.15), run_time=0.9)
        self.P(FadeIn(left, shift=RIGHT * 0.25), run_time=1.0)
        self.P(FadeIn(button), FadeIn(cursor), run_time=0.8)
        self.P(cursor.animate.shift(UP * 0.11), button.animate.scale(0.96), run_time=0.35)
        self.P(cursor.animate.shift(DOWN * 0.11), button.animate.scale(1 / 0.96), run_time=0.35)
        self.P(Create(bridge), FadeIn(right, shift=RIGHT * 0.25), run_time=1.2)
        self.P(
            Circumscribe(right, color=PURPLE, fade_out=True, time_width=0.7),
            run_time=1.0,
        )
        self.end()

    def s2_morning_engine(self):
        self.begin("s2")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "1 - Before the click",
            "The morning engine builds a structured issue",
            "Collection, ranking, original analysis, and email assembly happen first.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.1), run_time=0.9)

        specs = [
            ("1", "COLLECT", "Finviz + market data", BLUE, LIGHT_BLUE),
            ("2", "RANK", "WIIM finds signal", GOLD, LIGHT_GOLD),
            ("3", "EXPLAIN", "Original summaries", GREEN, LIGHT_GREEN),
            ("4", "ASSEMBLE", "Issue + chart", PURPLE, LIGHT_PURPLE),
        ]
        stages = VGroup()
        for number, label, detail, color, fill_color in specs:
            shell = card(2.75, 2.25, fill=WHITE, stroke=LINE)
            badge = Circle(
                radius=0.27,
                fill_color=color,
                fill_opacity=1,
                stroke_width=0,
            )
            badge_text = txt(number, size=18, color=WHITE, weight=BOLD).move_to(badge)
            label_mob = txt(label, size=17, color=color, weight=BOLD)
            detail_mob = fit(txt(detail, size=21, color=INK, weight=BOLD), width=2.2)
            mini = VGroup(
                Rectangle(width=1.9, height=0.09, fill_color=fill_color, fill_opacity=1, stroke_width=0),
                Rectangle(width=1.5, height=0.09, fill_color=LINE, fill_opacity=1, stroke_width=0),
                Rectangle(width=1.75, height=0.09, fill_color=LINE, fill_opacity=1, stroke_width=0),
            ).arrange(DOWN, aligned_edge=LEFT, buff=0.13)
            contents = VGroup(VGroup(badge, badge_text), label_mob, detail_mob, mini)
            contents.arrange(DOWN, aligned_edge=LEFT, buff=0.18).move_to(shell)
            stages.add(VGroup(shell, contents))
        stages.arrange(RIGHT, buff=0.34).move_to(DOWN * 0.25)

        arrows = VGroup(
            *[
                Arrow(
                    stages[i].get_right(),
                    stages[i + 1].get_left(),
                    buff=0.06,
                    color=SAGE,
                    stroke_width=3,
                    tip_length=0.16,
                )
                for i in range(3)
            ]
        )
        self.P(
            LaggedStart(*[FadeIn(stage, shift=UP * 0.18) for stage in stages], lag_ratio=0.2),
            run_time=2.0,
        )
        self.P(Create(arrows), run_time=1.0)

        review = card(11.9, 0.95, fill="#EEF2EC", stroke="#CAD3C6")
        review_label = txt("MORNING REVIEW", size=17, color=SAGE, weight=BOLD)
        review_text = txt(
            "Ready issues  |  Needs review  |  Choose what to deliver",
            size=21,
            color=INK,
            weight=MEDIUM,
        )
        review_contents = VGroup(review_label, review_text).arrange(RIGHT, buff=0.5)
        review_contents.move_to(review)
        review_group = VGroup(review, review_contents).next_to(stages, DOWN, buff=0.45)
        self.P(FadeIn(review_group, shift=UP * 0.16), run_time=0.9)
        self.P(
            Circumscribe(review_group, color=SAGE, fade_out=True, time_width=0.7),
            run_time=1.0,
        )
        self.end()

    def s3_one_click(self):
        self.begin("s3")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "2 - The button",
            "Create once. Sync later. Never duplicate.",
            "The same control changes behavior based on the saved delivery record.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.1), run_time=0.9)

        issue = self.report_card().scale(0.86).move_to(LEFT * 4.1 + DOWN * 0.2)
        control_shell = card(3.3, 2.8, fill=WHITE, stroke="#C8D2C4")
        connected = pill("THE INTRADAY - CONNECTED", GREEN, LIGHT_GREEN, size=14)
        button = pill("SEND TO BEEHIIV", WHITE, SAGE, size=19, pad=0.42)
        helper = txt("Creates an editable draft", size=15, color=MUTED)
        control_contents = VGroup(connected, button, helper).arrange(DOWN, buff=0.35)
        control_contents.move_to(control_shell)
        control = VGroup(control_shell, control_contents).move_to(DOWN * 0.2)

        bee = self.beehiiv_card().scale(0.86).move_to(RIGHT * 4.1 + DOWN * 0.2)
        left_arrow = arrow_between(issue, control, color=SAGE)
        right_arrow = arrow_between(control, bee, color=PURPLE)
        self.P(FadeIn(issue), FadeIn(control), FadeIn(bee), run_time=1.2)
        self.P(Create(left_arrow), run_time=0.6)
        self.P(Indicate(button, color=GOLD, scale_factor=1.08), run_time=0.8)
        self.P(Create(right_arrow), run_time=0.7)

        states = VGroup(
            pill("FIRST CLICK: CREATED", GREEN, LIGHT_GREEN, size=15),
            pill("CHANGED: UPDATED", BLUE, LIGHT_BLUE, size=15),
            pill("NO CHANGE: UNCHANGED", MUTED, "#EEF0EE", size=15),
        ).arrange(RIGHT, buff=0.28).move_to(DOWN * 2.75)
        self.P(
            LaggedStart(*[FadeIn(state, shift=UP * 0.12) for state in states], lag_ratio=0.28),
            run_time=1.8,
        )

        sync_button = pill("SYNC TO BEEHIIV", WHITE, BLUE, size=19, pad=0.42)
        sync_button.move_to(button)
        sync_helper = txt("Updates the same\nBeehiiv post", size=15, color=MUTED)
        sync_helper.move_to(helper)
        self.P(Transform(button, sync_button), Transform(helper, sync_helper), run_time=0.9)

        fingerprint = pill("SHA-256 CONTENT FINGERPRINT", GOLD, LIGHT_GOLD, size=15)
        fingerprint.next_to(control, DOWN, buff=0.28)
        self.P(FadeIn(fingerprint, shift=UP * 0.1), run_time=0.8)
        self.end()

    def s4_connection(self):
        self.begin("s4")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "3 - Under the hood",
            "OAuth grants permission. MCP performs the action.",
            "This official path works with the Scale plan.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.1), run_time=0.9)

        oauth = self.connection_node(
            "OAUTH",
            "You approve\nThe Intraday",
            BLUE,
            LIGHT_BLUE,
        ).move_to(LEFT * 4.7 + DOWN * 0.1)
        vault = self.connection_node(
            "TOKEN VAULT",
            "AES-256-GCM\nencrypted",
            GREEN,
            LIGHT_GREEN,
        ).move_to(LEFT * 1.6 + DOWN * 0.1)
        mcp = self.connection_node(
            "BEEHIIV MCP",
            "save_post\nedit_post_content",
            PURPLE,
            LIGHT_PURPLE,
        ).move_to(RIGHT * 1.6 + DOWN * 0.1)
        publication = self.connection_node(
            "PUBLICATION",
            "The Intraday\neditable draft",
            GOLD,
            LIGHT_GOLD,
        ).move_to(RIGHT * 4.7 + DOWN * 0.1)
        nodes = VGroup(oauth, vault, mcp, publication)
        arrows = VGroup(
            arrow_between(oauth, vault, BLUE),
            arrow_between(vault, mcp, GREEN),
            arrow_between(mcp, publication, PURPLE),
        )
        self.P(
            LaggedStart(*[FadeIn(node, shift=UP * 0.16) for node in nodes], lag_ratio=0.22),
            run_time=2.0,
        )
        self.P(Create(arrows), run_time=1.1)

        compare = card(11.9, 1.25, fill=WHITE, stroke=LINE)
        no_rest = VGroup(
            pill("REST CREATE POST", RED, LIGHT_RED, size=15),
            txt("Enterprise only", size=19, color=RED, weight=BOLD),
        ).arrange(RIGHT, buff=0.25)
        yes_mcp = VGroup(
            pill("OFFICIAL MCP", GREEN, LIGHT_GREEN, size=15),
            txt("Works with your Scale plan", size=19, color=GREEN, weight=BOLD),
        ).arrange(RIGHT, buff=0.25)
        divider = Line(ORIGIN, DOWN * 0.66, color=LINE, stroke_width=2)
        compare_contents = VGroup(no_rest, divider, yes_mcp).arrange(RIGHT, buff=0.55)
        compare_contents.move_to(compare)
        compare_group = VGroup(compare, compare_contents).next_to(nodes, DOWN, buff=0.65)
        self.P(FadeIn(compare_group, shift=UP * 0.14), run_time=1.0)
        self.P(
            Circumscribe(yes_mcp, color=GREEN, fade_out=True, time_width=0.7),
            run_time=1.0,
        )
        self.end()

    def connection_node(self, label, detail, color, fill_color):
        shell = card(2.55, 2.35, fill=WHITE, stroke=LINE)
        badge = Circle(
            radius=0.38,
            fill_color=fill_color,
            fill_opacity=1,
            stroke_color=color,
            stroke_width=2.5,
        )
        dot = Circle(radius=0.11, fill_color=color, fill_opacity=1, stroke_width=0)
        dot.move_to(badge)
        label_mob = txt(label, size=16, color=color, weight=BOLD)
        detail_mob = txt(detail, size=18, color=INK, weight=MEDIUM)
        fit(detail_mob, width=2.15)
        contents = VGroup(VGroup(badge, dot), label_mob, detail_mob)
        contents.arrange(DOWN, buff=0.19).move_to(shell)
        return VGroup(shell, contents)

    def s5_guardrails(self):
        self.begin("s5")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "4 - Guardrails",
            "The shortcut removes transfer work, not control",
            "Identity, state, and content checks keep the action predictable.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.1), run_time=0.9)

        center = card(3.25, 2.3, fill=WHITE, stroke="#C8D2C4")
        center_title = txt("DELIVERY RECORD", size=18, color=SAGE, weight=BOLD)
        rows = VGroup(
            txt("Beehiiv post ID", size=18, color=INK),
            txt("Editor link", size=18, color=INK),
            txt("Publication + sync time", size=18, color=INK),
            txt("Content fingerprint", size=18, color=INK),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.14)
        center_contents = VGroup(center_title, rows).arrange(DOWN, aligned_edge=LEFT, buff=0.23)
        center_contents.move_to(center)
        record = VGroup(center, center_contents).move_to(DOWN * 0.05)

        guards = [
            ("ENCRYPTED", "OAuth token", BLUE, LIGHT_BLUE, LEFT * 4.5 + UP * 0.75),
            ("SAME POST", "No duplicates", GREEN, LIGHT_GREEN, LEFT * 4.5 + DOWN * 1.25),
            ("PUBLIC URL", "Chart renders", GOLD, LIGHT_GOLD, RIGHT * 4.5 + UP * 0.75),
            ("DRAFT ONLY", "Never auto-sent", RED, LIGHT_RED, RIGHT * 4.5 + DOWN * 1.25),
        ]
        guard_mobs = VGroup()
        arrows = VGroup()
        for label, detail, color, fill_color, position in guards:
            shell = card(2.6, 1.35, fill=WHITE, stroke=LINE)
            label_mob = pill(label, color, fill_color, size=14)
            detail_mob = txt(detail, size=19, color=INK, weight=BOLD)
            contents = VGroup(label_mob, detail_mob).arrange(DOWN, buff=0.18).move_to(shell)
            guard = VGroup(shell, contents).move_to(position)
            guard_mobs.add(guard)
            if position[0] < 0:
                arr = Arrow(
                    guard.get_right(),
                    record.get_left(),
                    buff=0.16,
                    color=color,
                    stroke_width=3,
                    tip_length=0.16,
                )
            else:
                arr = Arrow(
                    record.get_right(),
                    guard.get_left(),
                    buff=0.16,
                    color=color,
                    stroke_width=3,
                    tip_length=0.16,
                )
            arrows.add(arr)

        self.P(FadeIn(record, shift=UP * 0.15), run_time=1.0)
        self.P(
            LaggedStart(*[FadeIn(guard, shift=UP * 0.12) for guard in guard_mobs], lag_ratio=0.2),
            run_time=1.8,
        )
        self.P(Create(arrows), run_time=1.1)

        boundary = card(11.9, 0.95, fill=LIGHT_RED, stroke="#E6C2BD")
        boundary_text = txt(
            "Publish  |  Schedule  |  Audience  |  Send    stay inside Beehiiv",
            size=22,
            color=RED,
            weight=BOLD,
        ).move_to(boundary)
        boundary_group = VGroup(boundary, boundary_text).move_to(DOWN * 2.75)
        self.P(FadeIn(boundary_group, shift=UP * 0.12), run_time=0.9)
        self.P(
            Circumscribe(boundary_group, color=RED, fade_out=True, time_width=0.7),
            run_time=1.0,
        )
        self.end()

    def s6_daily_routine(self):
        self.begin("s6")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "5 - Your daily routine",
            "Five steps from morning run to scheduled email",
            "The final editorial decision always remains yours.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.1), run_time=0.9)

        steps_data = [
            ("1", "OPEN", "Morning Review"),
            ("2", "CHECK", "Issues + charts"),
            ("3", "EDIT", "Choose an issue"),
            ("4", "CLICK", "Send or Sync"),
            ("5", "FINISH", "Review in Beehiiv"),
        ]
        steps = VGroup()
        for number, action, detail in steps_data:
            shell = card(2.25, 2.25, fill=WHITE, stroke=LINE)
            badge = Circle(
                radius=0.3,
                fill_color=SAGE,
                fill_opacity=1,
                stroke_width=0,
            )
            number_mob = txt(number, size=18, color=WHITE, weight=BOLD).move_to(badge)
            action_mob = txt(action, size=17, color=SAGE, weight=BOLD)
            detail_mob = fit(txt(detail, size=19, color=INK, weight=BOLD), width=1.85)
            contents = VGroup(VGroup(badge, number_mob), action_mob, detail_mob)
            contents.arrange(DOWN, buff=0.2).move_to(shell)
            steps.add(VGroup(shell, contents))
        steps.arrange(RIGHT, buff=0.22).move_to(DOWN * 0.05)
        arrows = VGroup(
            *[
                Arrow(
                    steps[i].get_right(),
                    steps[i + 1].get_left(),
                    buff=0.02,
                    color=GOLD,
                    stroke_width=2.5,
                    tip_length=0.13,
                )
                for i in range(4)
            ]
        )
        self.P(
            LaggedStart(*[FadeIn(step, shift=UP * 0.12) for step in steps], lag_ratio=0.18),
            run_time=2.2,
        )
        self.P(Create(arrows), run_time=0.9)
        for step in steps:
            self.P(Indicate(step, color=GOLD, scale_factor=1.035), run_time=0.45)

        takeaway = card(11.9, 1.15, fill=INK, stroke=INK)
        left = txt("FIN QUOTE", size=21, color="#DDE6D8", weight=BOLD)
        middle = txt("prepares + transfers", size=22, color=WHITE, weight=MEDIUM)
        divider = txt("|", size=25, color="#758176")
        right = txt("BEEHIIV", size=21, color="#CDBCE6", weight=BOLD)
        ending = txt("reviews + delivers", size=22, color=WHITE, weight=MEDIUM)
        takeaway_text = VGroup(left, middle, divider, right, ending).arrange(RIGHT, buff=0.25)
        takeaway_text.move_to(takeaway)
        takeaway_group = VGroup(takeaway, takeaway_text).next_to(steps, DOWN, buff=0.55)
        self.P(FadeIn(takeaway_group, shift=UP * 0.15), run_time=1.0)
        self.P(
            Circumscribe(takeaway_group, color=GOLD, fade_out=True, time_width=0.7),
            run_time=1.0,
        )
        self.end()
