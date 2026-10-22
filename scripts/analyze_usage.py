"""LinLecture 실사용 기록 분석 스크립트.

입력 (둘 중 하나만 있어도 됨)
  --csv   server/logs/usage.csv        서버가 음성 구간마다 남긴 처리 기록
  --json  앱 '기록 내보내기'로 저장한 파일 강의 단위 기록 (.json 또는 .txt)

출력 (--out 폴더, 기본 docs/usage)
  summary.md                 핵심 수치 요약
  latency_by_session.png     강의별 평균 처리 시간 (인식 + 번역) vs 실시간 한계
  chunk_status.png           음성 구간 처리 결과 (성공/무음/오류)
  minutes_by_day.png         날짜별 사용 시간
  minutes_by_subject.png     과목별 사용 시간

사용 예
  pip3 install matplotlib
  python3 scripts/analyze_usage.py --csv server/logs/usage.csv --json ~/Downloads/linlecture.json
"""

import argparse
import csv
import json
import re
from collections import Counter, OrderedDict, defaultdict
from datetime import datetime
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager

# ---------- 스타일 ----------
SURFACE = "#fcfcfb"
INK = "#0b0b0b"
INK_2 = "#52514e"
GRID = "#e4e3df"
BLUE = "#2a78d6"  # series 1
ORANGE = "#eb6834"  # series 2
STATUS = {"ok": "#0ca30c", "silence": "#c3c2b7", "empty": "#a3a29c", "filtered": "#ec835a",
          "translate_error": "#fab219", "stt_error": "#d03b3b"}
STATUS_LABEL = {"ok": "성공", "silence": "무음 건너뜀", "empty": "인식 없음", "filtered": "환각 걸러냄",
                "translate_error": "번역 실패", "stt_error": "인식 실패"}

for name in ["Apple SD Gothic Neo", "AppleGothic", "Malgun Gothic", "NanumGothic", "Noto Sans CJK KR"]:
    if any(f.name == name for f in font_manager.fontManager.ttflist):
        plt.rcParams["font.family"] = name
        break
plt.rcParams.update({
    "axes.unicode_minus": False,
    "figure.facecolor": SURFACE,
    "axes.facecolor": SURFACE,
    "axes.edgecolor": GRID,
    "axes.labelcolor": INK_2,
    "xtick.color": INK_2,
    "ytick.color": INK_2,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.color": GRID,
    "grid.linewidth": 0.8,
    "font.size": 11,
})


def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def finish(fig, ax, title, path):
    ax.set_title(title, loc="left", fontsize=14, fontweight="bold", color=INK, pad=12)
    ax.set_axisbelow(True)
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)
    print("✓", path)


# ---------- 서버 CSV ----------
def analyze_csv(path, out, lines):
    with open(path, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        lines.append("- 서버 기록(usage.csv)이 비어 있습니다.")
        return

    sessions = OrderedDict()
    for row in rows:
        key = row.get("sessionId") or "(세션 없음)"
        sessions.setdefault(key, []).append(row)

    status = Counter(r.get("status", "") for r in rows)
    audio_total = sum(num(r.get("audioSec")) for r in rows)
    ok_rows = [r for r in rows if r.get("status") in ("ok", "translate_error")]
    whisper_avg = sum(num(r["whisperSec"]) for r in ok_rows) / max(len(ok_rows), 1)
    translate_avg = sum(num(r["translateSec"]) for r in ok_rows) / max(len(ok_rows), 1)
    audio_avg = audio_total / len(rows)
    slow = sum(1 for r in ok_rows if num(r["whisperSec"]) + num(r["translateSec"]) > num(r["audioSec"], audio_avg))

    lines += [
        "## 서버 처리 기록 (usage.csv)",
        "",
        f"- 기간: {rows[0]['timestamp'][:10]} ~ {rows[-1]['timestamp'][:10]}",
        f"- 강의(세션) 수: {len(sessions)}",
        f"- 처리한 음성 구간: {len(rows)}개 (총 {audio_total / 60:.1f}분 분량)",
        f"- 한국어 인식 글자 수: {sum(int(num(r.get('koChars'))) for r in rows):,}자",
        f"- 구간당 평균 처리 시간: 인식 {whisper_avg:.2f}초 + 번역 {translate_avg:.2f}초 (구간 길이 {audio_avg:.1f}초)",
        f"- 구간 길이보다 오래 걸린 구간(실시간 지연): {slow}개 / {len(ok_rows)}개",
        "- 처리 결과: " + ", ".join(f"{STATUS_LABEL.get(k, k)} {v}" for k, v in status.most_common()),
        "",
    ]

    # 1) 강의별 평균 처리 시간 (가로 누적 막대)
    labels, whisper, translate = [], [], []
    for sid, srows in sessions.items():
        good = [r for r in srows if r.get("status") in ("ok", "translate_error")]
        if not good:
            continue
        first = srows[0]
        stamp = datetime.fromisoformat(first["timestamp"].replace("Z", "+00:00")).astimezone()
        labels.append(f"{stamp:%m/%d %H:%M}  {first.get('subject') or ''}"[:28])
        whisper.append(sum(num(r["whisperSec"]) for r in good) / len(good))
        translate.append(sum(num(r["translateSec"]) for r in good) / len(good))
    if labels:
        fig, ax = plt.subplots(figsize=(9, max(2.6, 0.55 * len(labels) + 1.6)))
        y = range(len(labels))
        ax.barh(y, whisper, height=0.55, color=BLUE, label="음성 인식 (Whisper)", edgecolor=SURFACE, linewidth=2)
        ax.barh(y, translate, left=whisper, height=0.55, color=ORANGE, label="번역 (LibreTranslate)", edgecolor=SURFACE, linewidth=2)
        ax.axvline(audio_avg, color=INK_2, linestyle="--", linewidth=1.5)
        ax.set_yticks(list(y), labels)
        ax.invert_yaxis()
        ax.set_ylim(len(labels) - 0.5, -1.1)  # 위쪽에 기준선 설명 자리
        ax.text(audio_avg, -0.95, f"구간 길이 {audio_avg:.0f}초 = 실시간 한계 ", color=INK_2, fontsize=10, ha="right", va="center")
        ax.set_xlim(0, max(audio_avg, max(w + t for w, t in zip(whisper, translate))) * 1.08)
        ax.set_xlabel("구간당 평균 처리 시간 (초)")
        ax.grid(axis="y", visible=False)
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), ncol=2, frameon=False)
        finish(fig, ax, "강의별 평균 처리 시간", out / "latency_by_session.png")

    # 2) 구간 처리 결과
    order = [k for k in STATUS if status.get(k)]
    fig, ax = plt.subplots(figsize=(max(7, 1.5 * len(order) + 1), 3.4))
    bars = ax.bar([STATUS_LABEL[k] for k in order], [status[k] for k in order],
                  color=[STATUS[k] for k in order], width=0.55)
    for bar, k in zip(bars, order):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height(), f"{status[k]} ({status[k] / len(rows):.0%})",
                ha="center", va="bottom", color=INK, fontsize=10)
    ax.set_ylabel("구간 수")
    ax.set_ylim(0, max(status.values()) * 1.15)
    ax.grid(axis="x", visible=False)
    finish(fig, ax, f"음성 구간 처리 결과 (총 {len(rows)}개)", out / "chunk_status.png")


# ---------- 앱 내보내기 JSON ----------
def load_export(path):
    text = Path(path).read_text(encoding="utf-8")
    match = re.search(r"\{.*\}", text, re.S)  # 공유 시트가 앞뒤에 문자를 붙여도 처리
    data = json.loads(match.group(0) if match else text)
    return data["lectures"] if isinstance(data, dict) else data


def analyze_json(path, out, lines):
    lectures = load_export(path)
    if not lectures:
        lines.append("- 앱 기록이 비어 있습니다.")
        return

    by_day = defaultdict(float)
    by_subject = defaultdict(lambda: [0, 0.0])
    total_min = 0.0
    for item in lectures:
        try:
            start = datetime.fromisoformat(item["startedAt"].replace("Z", "+00:00")).astimezone()
        except (KeyError, ValueError):
            continue
        if item.get("stats"):
            minutes = item["stats"]["durationSec"] / 60
        else:
            try:
                end = datetime.fromisoformat(item["endedAt"].replace("Z", "+00:00")).astimezone()
                minutes = max((end - start).total_seconds() / 60, 0)
            except (KeyError, ValueError):
                minutes = 0
        total_min += minutes
        by_day[start.date()] += minutes
        subject = by_subject[item.get("subject") or "과목 미지정"]
        subject[0] += 1
        subject[1] += minutes

    days = sorted(by_day)
    lines += [
        "## 앱 강의 기록 (내보내기 JSON)",
        "",
        f"- 기간: {days[0]} ~ {days[-1]} (사용한 날 {len(days)}일)",
        f"- 저장된 강의: {len(lectures)}회, 총 {total_min:.0f}분",
        "- 과목별: " + ", ".join(f"{s} {c}회/{m:.0f}분" for s, (c, m) in sorted(by_subject.items(), key=lambda x: -x[1][1])),
        "",
    ]

    # 3) 날짜별 사용 시간 (사용하지 않은 날도 0으로 표시)
    span = (days[-1] - days[0]).days + 1
    all_days = [days[0].fromordinal(days[0].toordinal() + i) for i in range(span)]
    fig, ax = plt.subplots(figsize=(max(6, 0.32 * span + 2), 3.4))
    ax.bar([d.strftime("%m/%d") for d in all_days], [by_day.get(d, 0) for d in all_days], color=BLUE, width=0.6)
    ax.set_ylabel("사용 시간 (분)")
    ax.grid(axis="x", visible=False)
    if span > 14:
        for i, label in enumerate(ax.get_xticklabels()):
            label.set_visible(i % 2 == 0)
    plt.setp(ax.get_xticklabels(), rotation=45, ha="right")
    finish(fig, ax, f"날짜별 사용 시간 (총 {total_min:.0f}분)", out / "minutes_by_day.png")

    # 4) 과목별 사용 시간
    items = sorted(by_subject.items(), key=lambda x: x[1][1])
    fig, ax = plt.subplots(figsize=(8, max(2.4, 0.5 * len(items) + 1.4)))
    bars = ax.barh([s for s, _ in items], [m for _, (c, m) in items], color=BLUE, height=0.5)
    for bar, (_, (count, minutes)) in zip(bars, items):
        ax.text(bar.get_width(), bar.get_y() + bar.get_height() / 2, f"  {minutes:.0f}분 · {count}회",
                va="center", color=INK, fontsize=10)
    ax.set_xlabel("사용 시간 (분)")
    ax.grid(axis="y", visible=False)
    ax.margins(x=0.18)
    finish(fig, ax, "과목별 사용 시간", out / "minutes_by_subject.png")


def main():
    parser = argparse.ArgumentParser(description="LinLecture 실사용 기록 분석")
    parser.add_argument("--csv", help="server/logs/usage.csv")
    parser.add_argument("--json", help="앱에서 내보낸 기록 파일")
    parser.add_argument("--out", default="docs/usage", help="결과 폴더")
    args = parser.parse_args()
    if not args.csv and not args.json:
        parser.error("--csv 또는 --json 중 하나는 필요합니다.")

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    lines = ["# LinLecture 실사용 기록 요약", "", f"생성: {datetime.now():%Y-%m-%d %H:%M}", ""]
    if args.json:
        analyze_json(args.json, out, lines)
    if args.csv:
        analyze_csv(args.csv, out, lines)
    (out / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("✓", out / "summary.md")


if __name__ == "__main__":
    main()
