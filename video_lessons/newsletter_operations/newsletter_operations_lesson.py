"""
Newsletter Operations: a diagram-first explanation of Fin Quote's publishing system.

Generate narration:
  ./gen_audio.sh

Render:
  ~/Library/Python/3.9/bin/manim -qh \
    newsletter_operations_lesson.py NewsletterOperationsLesson

Mux:
  ffmpeg \
    -i media/videos/newsletter_operations_lesson/1080p60/NewsletterOperationsLesson.mp4 \
    -i audio/narration.mp3 \
    -c:v copy \
    -af "loudnorm=I=-16:TP=-1.5:LRA=7" \
    -c:a aac -b:a 192k -ar 48000 \
    -shortest -movflags +faststart \
    Newsletter_Operations_Explainer.mp4
"""
import json
import os

from manim import *

DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(DIR, "durations.json"), encoding="utf-8") as handle:
    DURS = json.load(handle)

FONT = "Avenir Next"

INK = "#17211A"
MUTED = "#637068"
BG = "#F5F7F4"
WHITE = "#FFFFFF"
LINE = "#D8DED8"
SAGE = "#596B4A"
GREEN = "#2E7D52"
LIGHT_GREEN = "#E7F2E9"
GOLD = "#B9822D"
LIGHT_GOLD = "#FAF0D9"
BLUE = "#35698A"
LIGHT_BLUE = "#E7F0F6"
PURPLE = "#7656A8"
LIGHT_PURPLE = "#F0EAF8"
RED = "#B6473C"
LIGHT_RED = "#F8EAE8"
ORANGE = "#B85E2F"
LIGHT_ORANGE = "#FAECE4"


def txt(value, size=24, color=INK, weight=NORMAL, **kwargs):
    return Text(
        value,
        font=FONT,
        font_size=size,
        color=color,
        weight=weight,
        line_spacing=0.78,
        **kwargs,
    )


def fit(mob, width=None, height=None):
    if width and mob.width > width:
        mob.scale_to_fit_width(width)
    if height and mob.height > height:
        mob.scale_to_fit_height(height)
    return mob


def card(width, height, fill=WHITE, stroke=LINE, radius=0.14, stroke_width=1.6):
    return RoundedRectangle(
        width=width,
        height=height,
        corner_radius=radius,
        fill_color=fill,
        fill_opacity=1,
        stroke_color=stroke,
        stroke_width=stroke_width,
    )


def pill(label, color, fill_color, size=17, pad=0.24):
    label_mob = txt(label, size=size, color=color, weight=BOLD)
    shell = RoundedRectangle(
        width=label_mob.width + pad * 2,
        height=label_mob.height + 0.18,
        corner_radius=0.15,
        fill_color=fill_color,
        fill_opacity=1,
        stroke_color=color,
        stroke_width=1.3,
    )
    label_mob.move_to(shell)
    return VGroup(shell, label_mob)


def dot(color, radius=0.08):
    return Circle(radius=radius, fill_color=color, fill_opacity=1, stroke_width=0)


def arrow_between(left, right, color=SAGE, buff=0.12):
    return Arrow(
        left.get_right(),
        right.get_left(),
        buff=buff,
        color=color,
        stroke_width=3.5,
        tip_length=0.18,
    )


def check_mark(color=GREEN, scale=0.2):
    return VGroup(
        Line(LEFT * 0.45, DOWN * 0.42, color=color, stroke_width=8),
        Line(DOWN * 0.42, RIGHT * 0.58 + UP * 0.52, color=color, stroke_width=8),
    ).scale(scale)


def lock_icon(color=INK, scale=1):
    body = RoundedRectangle(
        width=0.62,
        height=0.48,
        corner_radius=0.07,
        stroke_color=color,
        stroke_width=3,
        fill_color=WHITE,
        fill_opacity=1,
    )
    shackle = Arc(
        radius=0.22,
        start_angle=0,
        angle=PI,
        color=color,
        stroke_width=3,
    ).rotate(PI).next_to(body, UP, buff=-0.08)
    keyhole = Circle(radius=0.04, fill_color=color, fill_opacity=1, stroke_width=0)
    keyhole.move_to(body)
    return VGroup(shackle, body, keyhole).scale(scale)


def stage_card(number, title, detail, color, fill_color, width=2.1, height=1.65):
    shell = card(width, height, fill=WHITE, stroke=LINE)
    badge = Circle(radius=0.22, fill_color=color, fill_opacity=1, stroke_width=0)
    badge_label = txt(str(number), size=15, color=WHITE, weight=BOLD).move_to(badge)
    heading = txt(title, size=15, color=color, weight=BOLD)
    detail_mob = fit(txt(detail, size=17, color=INK, weight=MEDIUM), width=width - 0.35)
    bars = VGroup(
        Rectangle(
            width=width - 0.5,
            height=0.07,
            fill_color=fill_color,
            fill_opacity=1,
            stroke_width=0,
        ),
        Rectangle(
            width=width - 0.75,
            height=0.07,
            fill_color=LINE,
            fill_opacity=1,
            stroke_width=0,
        ),
    ).arrange(DOWN, aligned_edge=LEFT, buff=0.1)
    content = VGroup(VGroup(badge, badge_label), heading, detail_mob, bars)
    content.arrange(DOWN, aligned_edge=LEFT, buff=0.13).move_to(shell)
    return VGroup(shell, content)


def metric_card(label, value, status, color, fill_color):
    shell = card(2.7, 1.42, fill=WHITE, stroke=LINE)
    label_mob = txt(label.upper(), size=13, color=MUTED, weight=BOLD)
    value_mob = txt(value, size=25, color=INK, weight=BOLD)
    status_mob = VGroup(dot(color), txt(status, size=14, color=color, weight=BOLD))
    status_mob.arrange(RIGHT, buff=0.12)
    content = VGroup(label_mob, value_mob, status_mob)
    content.arrange(DOWN, aligned_edge=LEFT, buff=0.09).move_to(shell)
    return VGroup(shell, content)


class NewsletterOperationsLesson(Scene):
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
            self.P(*[FadeOut(mob) for mob in removable], run_time=0.65)

    def construct(self):
        self.camera.background_color = BG
        self.header = self.make_header()
        self.s1_system()
        self.s2_morning()
        self.s3_mid_morning()
        self.s4_control_room()
        self.s5_recovery()
        self.s6_beehiiv()
        self.s7_boundaries()
        self.s8_routine()

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
        lesson = txt("Newsletter Operations", size=18, color="#DDE4DA", weight=MEDIUM)
        brand.move_to(bar.get_center() + LEFT * 4.9)
        lesson.move_to(bar.get_center() + RIGHT * 4.35)
        return VGroup(bar, accent, brand, lesson)

    def section_title(self, eyebrow, title, subtitle=None):
        eye = txt(eyebrow.upper(), size=15, color=SAGE, weight=BOLD)
        heading = fit(txt(title, size=33, color=INK, weight=BOLD), width=12.0)
        group = VGroup(eye, heading).arrange(DOWN, aligned_edge=LEFT, buff=0.08)
        if subtitle:
            sub = fit(txt(subtitle, size=18, color=MUTED), width=12.0)
            group.add(sub)
            sub.next_to(heading, DOWN, aligned_edge=LEFT, buff=0.13)
        group.to_edge(LEFT, buff=0.7).to_edge(UP, buff=0.94)
        return group

    def system_node(self, label, detail, color, fill_color, width=2.55):
        shell = card(width, 1.65, fill=WHITE, stroke=LINE)
        marker = RoundedRectangle(
            width=0.14,
            height=1.18,
            corner_radius=0.07,
            fill_color=color,
            fill_opacity=1,
            stroke_width=0,
        )
        heading = txt(label, size=17, color=color, weight=BOLD)
        detail_mob = fit(txt(detail, size=17, color=INK, weight=MEDIUM), width=width - 0.65)
        body = VGroup(heading, detail_mob).arrange(DOWN, aligned_edge=LEFT, buff=0.16)
        content = VGroup(marker, body).arrange(RIGHT, buff=0.18).move_to(shell)
        wash = Rectangle(
            width=width - 0.2,
            height=0.12,
            fill_color=fill_color,
            fill_opacity=1,
            stroke_width=0,
        ).move_to(shell.get_bottom() + UP * 0.16)
        return VGroup(shell, wash, content)

    def s1_system(self):
        self.begin("s1")
        title = fit(
            txt("Your newsletter is now a publishing system", size=43, color=INK, weight=BOLD),
            width=12.2,
        ).move_to(UP * 2.38)
        subtitle = txt(
            "Automated research, observable pipelines, controlled delivery",
            size=22,
            color=MUTED,
        ).next_to(title, DOWN, buff=0.17)
        specs = [
            ("MARKET INPUTS", "Finviz, prices,\ncatalysts", BLUE, LIGHT_BLUE),
            ("ANALYSIS", "Ranking and\noriginal summaries", GOLD, LIGHT_GOLD),
            ("ISSUES", "Morning and\nmid-morning briefs", GREEN, LIGHT_GREEN),
            ("BEEHIIV", "Editable draft\nand final send", PURPLE, LIGHT_PURPLE),
        ]
        nodes = VGroup(
            *[
                self.system_node(label, detail, color, fill)
                for label, detail, color, fill in specs
            ]
        ).arrange(RIGHT, buff=0.48).move_to(DOWN * 0.32)
        arrows = VGroup(
            *[
                arrow_between(nodes[i], nodes[i + 1], color=SAGE, buff=0.08)
                for i in range(3)
            ]
        )
        operations = pill("NEWSLETTER OPERATIONS: SEE IT, RUN IT, RECOVER IT", SAGE, LIGHT_GREEN, size=17)
        operations.move_to(DOWN * 2.33)

        self.P(Write(title), run_time=1.4)
        self.P(FadeIn(subtitle, shift=UP * 0.12), run_time=0.8)
        self.P(
            LaggedStart(*[FadeIn(node, shift=UP * 0.16) for node in nodes], lag_ratio=0.18),
            run_time=2.2,
        )
        self.P(Create(arrows), run_time=1.0)
        self.P(FadeIn(operations, shift=UP * 0.14), run_time=0.8)
        self.P(Circumscribe(operations, color=SAGE, fade_out=True), run_time=1.0)
        self.end()

    def s2_morning(self):
        self.begin("s2")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "1 - Morning automation",
            "A durable assembly line before the opening bell",
            "Every stage saves progress, counts, timing, and errors.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        specs = [
            (1, "COLLECT", "Market\nsources", BLUE, LIGHT_BLUE),
            (2, "RANK", "Best\nsignals", GOLD, LIGHT_GOLD),
            (3, "SUMMARIZE", "Original\nanalysis", GREEN, LIGHT_GREEN),
            (4, "ASSEMBLE", "Issues and\ncharts", PURPLE, LIGHT_PURPLE),
            (5, "CHECK", "Quality and\nreadiness", ORANGE, LIGHT_ORANGE),
        ]
        stages = VGroup(
            *[
                stage_card(number, title, detail, color, fill)
                for number, title, detail, color, fill in specs
            ]
        ).arrange(RIGHT, buff=0.28).move_to(DOWN * 0.15)
        arrows = VGroup(
            *[
                arrow_between(stages[i], stages[i + 1], color=SAGE, buff=0.05)
                for i in range(len(stages) - 1)
            ]
        )
        self.P(
            LaggedStart(*[FadeIn(stage, shift=UP * 0.15) for stage in stages], lag_ratio=0.14),
            run_time=2.2,
        )
        self.P(Create(arrows), run_time=1.0)

        checks = VGroup()
        for stage in stages:
            badge = Circle(
                radius=0.17,
                fill_color=LIGHT_GREEN,
                fill_opacity=1,
                stroke_color=GREEN,
                stroke_width=1.4,
            )
            mark = check_mark(GREEN, scale=0.18).move_to(badge)
            checks.add(VGroup(badge, mark).move_to(stage.get_corner(UR) + LEFT * 0.23 + DOWN * 0.23))
        self.P(
            LaggedStart(*[FadeIn(mark, scale=0.6) for mark in checks], lag_ratio=0.18),
            run_time=1.6,
        )

        record_shell = card(11.8, 1.0, fill="#EEF2EC", stroke="#C8D2C4")
        record_label = txt("DURABLE RUN RECORD", size=15, color=SAGE, weight=BOLD)
        record_data = txt(
            "market date  |  current stage  |  counts  |  timestamps  |  errors",
            size=20,
            color=INK,
            weight=MEDIUM,
        )
        record_content = VGroup(record_label, record_data).arrange(RIGHT, buff=0.55)
        record_content.move_to(record_shell)
        record = VGroup(record_shell, record_content).next_to(stages, DOWN, buff=0.5)
        self.P(FadeIn(record, shift=UP * 0.14), run_time=0.9)
        self.P(Circumscribe(record, color=SAGE, fade_out=True), run_time=1.0)
        self.end()

    def s3_mid_morning(self):
        self.begin("s3")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "2 - Mid-morning update",
            "The second report explains what changed",
            "It preserves the pre-market context and isolates the new session signal.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        morning_shell = card(5.1, 3.45, fill=WHITE, stroke=LINE)
        morning_label = pill("BEFORE THE OPEN", BLUE, LIGHT_BLUE, size=14)
        morning_title = txt("Morning snapshot", size=24, color=INK, weight=BOLD)
        morning_items = VGroup(
            txt("NVDA: catalyst identified", size=17, color=INK),
            txt("Rates: direction established", size=17, color=INK),
            txt("Top movers: ranked", size=17, color=INK),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        morning_content = VGroup(morning_label, morning_title, morning_items)
        morning_content.arrange(DOWN, aligned_edge=LEFT, buff=0.22).move_to(morning_shell)
        morning = VGroup(morning_shell, morning_content).move_to(LEFT * 3.45 + DOWN * 0.2)

        live_shell = card(5.1, 3.45, fill=WHITE, stroke=LINE)
        live_label = pill("AFTER THE BELL", GREEN, LIGHT_GREEN, size=14)
        live_title = txt("Live session", size=24, color=INK, weight=BOLD)
        live_items = VGroup(
            VGroup(dot(GREEN), txt("accelerated", size=17, color=GREEN, weight=BOLD)),
            VGroup(dot(RED), txt("reversed", size=17, color=RED, weight=BOLD)),
            VGroup(dot(GOLD), txt("confirmed", size=17, color=GOLD, weight=BOLD)),
        )
        for item in live_items:
            item.arrange(RIGHT, buff=0.15)
        live_items.arrange(DOWN, aligned_edge=LEFT, buff=0.22)
        live_content = VGroup(live_label, live_title, live_items)
        live_content.arrange(DOWN, aligned_edge=LEFT, buff=0.22).move_to(live_shell)
        live = VGroup(live_shell, live_content).move_to(RIGHT * 3.45 + DOWN * 0.2)

        delta = pill("COMPARE", WHITE, SAGE, size=16, pad=0.34)
        delta.move_to(DOWN * 0.18)
        bridge = Arrow(
            morning.get_right(),
            live.get_left(),
            buff=0.18,
            color=SAGE,
            stroke_width=4,
            tip_length=0.22,
        )
        output = pill(
            "MID-MORNING BRIEF = WHAT CHANGED + WHY IT MATTERS",
            PURPLE,
            LIGHT_PURPLE,
            size=17,
        ).move_to(DOWN * 2.42)

        self.P(FadeIn(morning, shift=RIGHT * 0.18), run_time=1.0)
        self.P(FadeIn(live, shift=LEFT * 0.18), run_time=1.0)
        self.P(Create(bridge), FadeIn(delta), run_time=1.0)
        self.P(
            LaggedStart(*[Indicate(item, scale_factor=1.04) for item in live_items], lag_ratio=0.35),
            run_time=2.0,
        )
        self.P(FadeIn(output, shift=UP * 0.15), run_time=0.9)
        self.P(Circumscribe(output, color=PURPLE, fade_out=True), run_time=1.0)
        self.end()

    def dashboard_panel(self, title, stage, color, fill_color, percent, details):
        shell = card(5.8, 3.55, fill=WHITE, stroke=LINE)
        title_mob = txt(title, size=22, color=INK, weight=BOLD)
        stage_pill = pill(stage, color, fill_color, size=14)
        top = VGroup(title_mob, stage_pill).arrange(RIGHT, buff=0.35)
        rail = RoundedRectangle(
            width=4.9,
            height=0.17,
            corner_radius=0.08,
            fill_color="#E5E9E5",
            fill_opacity=1,
            stroke_width=0,
        )
        fill = RoundedRectangle(
            width=4.9 * percent,
            height=0.17,
            corner_radius=0.08,
            fill_color=color,
            fill_opacity=1,
            stroke_width=0,
        )
        fill.align_to(rail, LEFT)
        metrics = VGroup(
            *[
                VGroup(
                    txt(label.upper(), size=12, color=MUTED, weight=BOLD),
                    txt(value, size=18, color=INK, weight=BOLD),
                ).arrange(DOWN, aligned_edge=LEFT, buff=0.04)
                for label, value in details
            ]
        ).arrange(RIGHT, buff=0.5)
        heartbeat = VGroup(dot(GREEN), txt("Heartbeat healthy", size=14, color=GREEN, weight=BOLD))
        heartbeat.arrange(RIGHT, buff=0.12)
        content = VGroup(top, VGroup(rail, fill), metrics, heartbeat)
        content.arrange(DOWN, aligned_edge=LEFT, buff=0.34).move_to(shell)
        return VGroup(shell, content)

    def s4_control_room(self):
        self.begin("s4")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "3 - Newsletter Operations",
            "One surface answers the operational questions",
            "Status first, detail second, recovery controls where they are needed.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        metrics = VGroup(
            metric_card("Morning", "Ready", "complete", GREEN, LIGHT_GREEN),
            metric_card("Mid-morning", "Running", "summaries", BLUE, LIGHT_BLUE),
            metric_card("Beehiiv", "Connected", "healthy", PURPLE, LIGHT_PURPLE),
            metric_card("Alerts", "1", "needs review", GOLD, LIGHT_GOLD),
        ).arrange(RIGHT, buff=0.25).move_to(UP * 0.92)
        self.P(
            LaggedStart(*[FadeIn(metric, shift=UP * 0.12) for metric in metrics], lag_ratio=0.14),
            run_time=1.7,
        )

        morning = self.dashboard_panel(
            "Morning pipeline",
            "READY",
            GREEN,
            LIGHT_GREEN,
            1.0,
            [("Issues", "6"), ("Sources", "42"), ("Duration", "8m")],
        ).move_to(LEFT * 3.05 + DOWN * 1.05)
        mid = self.dashboard_panel(
            "Mid-morning pipeline",
            "SUMMARIES",
            BLUE,
            LIGHT_BLUE,
            0.62,
            [("Updates", "4"), ("Invocations", "3"), ("Elapsed", "2m")],
        ).move_to(RIGHT * 3.05 + DOWN * 1.05)
        self.P(FadeIn(morning, shift=RIGHT * 0.14), FadeIn(mid, shift=LEFT * 0.14), run_time=1.2)
        self.P(Indicate(metrics[3], color=GOLD, scale_factor=1.04), run_time=0.8)
        self.P(Indicate(mid, color=BLUE, scale_factor=1.015), run_time=0.9)

        footer = VGroup(
            pill("PROVIDER HEALTH", BLUE, LIGHT_BLUE, size=13),
            pill("ISSUE ATTENTION", GOLD, LIGHT_GOLD, size=13),
            pill("RECENT RUNS", SAGE, LIGHT_GREEN, size=13),
            pill("DELIVERY HISTORY", PURPLE, LIGHT_PURPLE, size=13),
        ).arrange(RIGHT, buff=0.26).move_to(DOWN * 3.0)
        self.P(FadeIn(footer, shift=UP * 0.1), run_time=0.9)
        self.end()

    def s5_recovery(self):
        self.begin("s5")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "4 - Run now and retry",
            "Recovery resumes the failed stage",
            "Completed work remains completed.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        labels = ["COLLECT", "RANK", "SUMMARIZE", "ASSEMBLE", "READY"]
        colors = [GREEN, GREEN, RED, MUTED, MUTED]
        nodes = VGroup()
        for index, (label, color) in enumerate(zip(labels, colors)):
            shell = Circle(
                radius=0.36,
                fill_color=(LIGHT_GREEN if color == GREEN else LIGHT_RED if color == RED else WHITE),
                fill_opacity=1,
                stroke_color=color,
                stroke_width=2.2,
            )
            if color == GREEN:
                symbol = check_mark(GREEN, scale=0.28).move_to(shell)
            elif color == RED:
                symbol = txt("!", size=26, color=RED, weight=BOLD).move_to(shell)
            else:
                symbol = txt(str(index + 1), size=17, color=MUTED, weight=BOLD).move_to(shell)
            name = txt(label, size=13, color=color, weight=BOLD).next_to(shell, DOWN, buff=0.15)
            nodes.add(VGroup(shell, symbol, name))
        nodes.arrange(RIGHT, buff=1.0).move_to(UP * 0.75)
        links = VGroup(
            *[
                Line(
                    nodes[i][0].get_right(),
                    nodes[i + 1][0].get_left(),
                    color=(GREEN if i < 2 else LINE),
                    stroke_width=4,
                )
                for i in range(4)
            ]
        )
        self.P(FadeIn(nodes), Create(links), run_time=1.2)

        failed = pill("LAST FAILURE: SUMMARIES", RED, LIGHT_RED, size=16).move_to(DOWN * 0.25)
        retry = pill("RETRY FAILED STAGE", WHITE, RED, size=18, pad=0.38).move_to(DOWN * 1.12)
        self.P(FadeIn(failed), FadeIn(retry, shift=UP * 0.1), run_time=0.9)
        self.P(Indicate(retry, color=GOLD, scale_factor=1.06), run_time=0.8)

        repaired_shell = Circle(
            radius=0.36,
            fill_color=LIGHT_BLUE,
            fill_opacity=1,
            stroke_color=BLUE,
            stroke_width=2.2,
        ).move_to(nodes[2][0])
        repaired_symbol = txt("3", size=17, color=BLUE, weight=BOLD).move_to(repaired_shell)
        repaired_name = txt("SUMMARIZE", size=13, color=BLUE, weight=BOLD).next_to(
            repaired_shell, DOWN, buff=0.15
        )
        repaired = VGroup(repaired_shell, repaired_symbol, repaired_name)
        self.P(Transform(nodes[2], repaired), run_time=0.8)

        lease = VGroup(
            lock_icon(SAGE, scale=0.75),
            VGroup(
                txt("ONE WORKER LEASE", size=14, color=SAGE, weight=BOLD),
                txt("prevents duplicate ownership", size=15, color=MUTED),
            ).arrange(DOWN, aligned_edge=LEFT, buff=0.05),
        ).arrange(RIGHT, buff=0.18)
        idempotent = VGroup(
            pill("SAVED IDS", PURPLE, LIGHT_PURPLE, size=13),
            VGroup(
                txt("IDEMPOTENT CALLS", size=14, color=PURPLE, weight=BOLD),
                txt("prevent duplicate output", size=15, color=MUTED),
            ).arrange(DOWN, aligned_edge=LEFT, buff=0.05),
        ).arrange(RIGHT, buff=0.18)
        guardrails = VGroup(lease, idempotent).arrange(RIGHT, buff=1.0).move_to(DOWN * 2.35)
        self.P(FadeIn(guardrails, shift=UP * 0.12), run_time=1.0)
        self.P(Circumscribe(nodes[0:3], color=GREEN, fade_out=True), run_time=1.0)
        self.end()

    def issue_card(self):
        shell = card(3.55, 3.15, fill=WHITE, stroke=LINE)
        label = pill("READY ISSUE", GREEN, LIGHT_GREEN, size=13)
        title = txt("Morning Brief", size=23, color=INK, weight=BOLD)
        bars = VGroup(
            Rectangle(width=2.75, height=0.09, fill_color=LINE, fill_opacity=1, stroke_width=0),
            Rectangle(width=2.35, height=0.09, fill_color=LINE, fill_opacity=1, stroke_width=0),
            Rectangle(width=2.6, height=0.09, fill_color=LINE, fill_opacity=1, stroke_width=0),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.16)
        stats = VGroup(
            pill("6 stories", BLUE, LIGHT_BLUE, size=13),
            pill("1 chart", GOLD, LIGHT_GOLD, size=13),
        ).arrange(RIGHT, buff=0.14)
        content = VGroup(label, title, bars, stats)
        content.arrange(DOWN, aligned_edge=LEFT, buff=0.25).move_to(shell)
        return VGroup(shell, content)

    def beehiiv_draft(self):
        shell = card(3.55, 3.15, fill="#FCFAFF", stroke="#DCD3EA")
        label = pill("BEEHIIV", PURPLE, LIGHT_PURPLE, size=13)
        title = txt("Editable draft", size=23, color=INK, weight=BOLD)
        editor = card(2.75, 1.12, fill=WHITE, stroke="#DDD5E8")
        lines = VGroup(
            Rectangle(width=2.15, height=0.08, fill_color=LINE, fill_opacity=1, stroke_width=0),
            Rectangle(width=1.85, height=0.08, fill_color=LINE, fill_opacity=1, stroke_width=0),
            Rectangle(width=2.3, height=0.08, fill_color=LINE, fill_opacity=1, stroke_width=0),
        ).arrange(DOWN, aligned_edge=LEFT, buff=0.14).move_to(editor)
        state = pill("DRAFT - NOT SENT", RED, LIGHT_RED, size=13)
        content = VGroup(label, title, VGroup(editor, lines), state)
        content.arrange(DOWN, aligned_edge=LEFT, buff=0.21).move_to(shell)
        return VGroup(shell, content)

    def s6_beehiiv(self):
        self.begin("s6")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "5 - Beehiiv delivery state",
            "Create once, sync revisions, skip unchanged writes",
            "The saved relationship keeps the workflow predictable.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        issue = self.issue_card().move_to(LEFT * 4.25 + DOWN * 0.25)
        draft = self.beehiiv_draft().move_to(RIGHT * 4.25 + DOWN * 0.25)
        hub_shell = card(3.2, 3.15, fill=WHITE, stroke="#C7D1C3")
        fingerprint = pill("CONTENT FINGERPRINT", SAGE, LIGHT_GREEN, size=13)
        states = VGroup(
            VGroup(dot(GREEN), txt("First: create", size=16, color=INK, weight=MEDIUM)),
            VGroup(dot(PURPLE), txt("Changed: sync", size=16, color=INK, weight=MEDIUM)),
            VGroup(dot(GOLD), txt("Same: no-op", size=16, color=INK, weight=MEDIUM)),
        )
        for row in states:
            row.arrange(RIGHT, buff=0.14)
        states.arrange(DOWN, aligned_edge=LEFT, buff=0.2)
        saved = txt("post ID + editor link", size=15, color=MUTED)
        hub_content = VGroup(fingerprint, states, saved)
        hub_content.arrange(DOWN, aligned_edge=LEFT, buff=0.3).move_to(hub_shell)
        hub = VGroup(hub_shell, hub_content).move_to(DOWN * 0.25)
        left_arrow = arrow_between(issue, hub, SAGE, buff=0.1)
        right_arrow = arrow_between(hub, draft, PURPLE, buff=0.1)

        self.P(FadeIn(issue), FadeIn(hub), FadeIn(draft), run_time=1.2)
        self.P(Create(left_arrow), run_time=0.6)
        self.P(
            LaggedStart(*[Indicate(row, scale_factor=1.04) for row in states], lag_ratio=0.4),
            run_time=2.2,
        )
        self.P(Create(right_arrow), run_time=0.7)
        self.P(Circumscribe(draft, color=PURPLE, fade_out=True), run_time=1.0)

        health = VGroup(
            pill("CONNECTED", GREEN, LIGHT_GREEN, size=13),
            pill("RECENT DELIVERIES", BLUE, LIGHT_BLUE, size=13),
            pill("STALE RECORDS", GOLD, LIGHT_GOLD, size=13),
            pill("RECONCILIATION", RED, LIGHT_RED, size=13),
        ).arrange(RIGHT, buff=0.22).move_to(DOWN * 2.6)
        self.P(FadeIn(health, shift=UP * 0.1), run_time=0.9)
        self.end()

    def boundary_card(self, title, detail, color, fill_color, icon_mob=None):
        shell = card(3.55, 2.5, fill=WHITE, stroke=LINE)
        title_mob = txt(title, size=18, color=color, weight=BOLD)
        detail_mob = fit(txt(detail, size=17, color=INK, weight=MEDIUM), width=2.9)
        if icon_mob is None:
            icon_mob = dot(color, radius=0.16)
        content = VGroup(icon_mob, title_mob, detail_mob)
        content.arrange(DOWN, buff=0.22).move_to(shell)
        wash = Rectangle(
            width=3.2,
            height=0.1,
            fill_color=fill_color,
            fill_opacity=1,
            stroke_width=0,
        ).move_to(shell.get_bottom() + UP * 0.16)
        return VGroup(shell, wash, content)

    def s7_boundaries(self):
        self.begin("s7")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "6 - Access and publishing boundaries",
            "Automation stops before the irreversible decision",
            "Owner controls on the left. Final editorial judgment on the right.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        owner = self.boundary_card(
            "SIGNED-IN OWNER",
            "Operations reads and mutations require operator access.",
            SAGE,
            LIGHT_GREEN,
            lock_icon(SAGE, scale=0.75),
        )
        unauthorized = self.boundary_card(
            "401 / 403",
            "Anonymous and non-owner requests are rejected.",
            RED,
            LIGHT_RED,
            txt("X", size=30, color=RED, weight=BOLD),
        )
        server = self.boundary_card(
            "SERVER SECRETS",
            "Credentials and provider tokens never enter the browser.",
            BLUE,
            LIGHT_BLUE,
            lock_icon(BLUE, scale=0.75),
        )
        cards = VGroup(owner, unauthorized, server).arrange(RIGHT, buff=0.4).move_to(UP * 0.15)
        self.P(
            LaggedStart(*[FadeIn(item, shift=UP * 0.14) for item in cards], lag_ratio=0.18),
            run_time=1.8,
        )

        boundary = DashedLine(
            LEFT * 5.5,
            RIGHT * 5.5,
            color=GOLD,
            stroke_width=3,
            dash_length=0.14,
        ).move_to(DOWN * 1.7)
        label = pill("HUMAN DECISION BOUNDARY", GOLD, LIGHT_GOLD, size=14).move_to(boundary)
        self.P(Create(boundary), FadeIn(label), run_time=0.9)

        left = VGroup(
            pill("FIN QUOTE", SAGE, LIGHT_GREEN, size=13),
            txt("create and edit draft", size=18, color=INK, weight=BOLD),
        ).arrange(DOWN, buff=0.12).move_to(LEFT * 3.1 + DOWN * 2.55)
        right = VGroup(
            pill("BEEHIIV", PURPLE, LIGHT_PURPLE, size=13),
            txt("audience + schedule + publish", size=18, color=INK, weight=BOLD),
        ).arrange(DOWN, buff=0.12).move_to(RIGHT * 3.1 + DOWN * 2.55)
        self.P(FadeIn(left), FadeIn(right), run_time=0.9)
        self.P(Indicate(right, color=PURPLE, scale_factor=1.04), run_time=0.9)
        self.end()

    def s8_routine(self):
        self.begin("s8")
        self.clear_stage()
        self.add(self.header)
        heading = self.section_title(
            "7 - Your daily routine",
            "The simple operating model",
            "Automation handles repetition. You handle judgment.",
        )
        self.P(FadeIn(heading, shift=DOWN * 0.08), run_time=0.8)

        steps = [
            ("1", "AUTOMATION", "Morning run builds", BLUE, LIGHT_BLUE),
            ("2", "REVIEW", "Judge stories", GOLD, LIGHT_GOLD),
            ("3", "OPERATIONS", "Confirm health", SAGE, LIGHT_GREEN),
            ("4", "UPDATE", "See what changed", GREEN, LIGHT_GREEN),
            ("5", "BEEHIIV", "Review and send", PURPLE, LIGHT_PURPLE),
        ]
        timeline = VGroup()
        for number, label, detail, color, fill_color in steps:
            marker = Circle(radius=0.31, fill_color=color, fill_opacity=1, stroke_width=0)
            number_mob = txt(number, size=17, color=WHITE, weight=BOLD).move_to(marker)
            label_mob = txt(label, size=14, color=color, weight=BOLD)
            detail_mob = fit(txt(detail, size=16, color=INK, weight=MEDIUM), width=1.75)
            item = VGroup(VGroup(marker, number_mob), label_mob, detail_mob)
            item.arrange(DOWN, buff=0.15)
            timeline.add(item)
        timeline.arrange(RIGHT, buff=0.65).move_to(UP * 0.15)
        line = Line(
            timeline[0][0].get_center(),
            timeline[-1][0].get_center(),
            color=LINE,
            stroke_width=5,
        )
        line.set_z_index(-1)
        self.P(Create(line), run_time=0.8)
        self.P(
            LaggedStart(*[FadeIn(step, shift=UP * 0.12) for step in timeline], lag_ratio=0.2),
            run_time=2.2,
        )
        self.P(
            LaggedStart(*[Indicate(step[0], scale_factor=1.12) for step in timeline], lag_ratio=0.35),
            run_time=2.5,
        )

        statement_shell = card(11.5, 1.55, fill=INK, stroke=INK)
        statement = fit(
            txt(
                "Automate the repeatable work. Keep judgment at the send button.",
                size=27,
                color=WHITE,
                weight=BOLD,
            ),
            width=10.65,
        ).move_to(statement_shell)
        statement_group = VGroup(statement_shell, statement).move_to(DOWN * 2.15)
        self.P(FadeIn(statement_group, shift=UP * 0.18), run_time=1.0)
        self.P(Circumscribe(statement_group, color=SAGE, fade_out=True), run_time=1.0)
        self.end()
