import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt


def load_result(result_path: Path) -> dict:
    with result_path.open('r', encoding='utf-8-sig') as handle:
        return json.load(handle)


def plot_result(result: dict, chart_path: Path) -> None:
    samples = result.get('samples', [])
    seqs = [sample.get('seq', 0) for sample in samples]
    rtts = [sample.get('rtt', 0) for sample in samples]

    stats = result.get('stats', {})
    metric_names = ['avg', 'p95', 'p99', 'max']
    metric_values = [
        stats.get('avgRttMs', 0),
        stats.get('p95RttMs', 0),
        stats.get('p99RttMs', 0),
        stats.get('maxRttMs', 0),
    ]

    fig = plt.figure(figsize=(12, 8), dpi=140)
    fig.suptitle(f"{result.get('testName', 'Test')} - latency chart", fontsize=16, fontweight='bold')

    ax1 = fig.add_subplot(2, 1, 1)
    if seqs:
      ax1.plot(seqs, rtts, marker='o', linewidth=1.8, color='#1f77b4')
      ax1.scatter(seqs, rtts, s=32, color='#1f77b4')
    ax1.set_title('RTT by sequence')
    ax1.set_xlabel('Sequence')
    ax1.set_ylabel('RTT (ms)')
    ax1.grid(True, alpha=0.25)

    ax2 = fig.add_subplot(2, 1, 2)
    bars = ax2.bar(metric_names, metric_values, color=['#2ca02c', '#ff7f0e', '#d62728', '#9467bd'])
    ax2.set_title('Latency summary')
    ax2.set_ylabel('RTT (ms)')
    ax2.grid(axis='y', alpha=0.25)

    for bar, value in zip(bars, metric_values):
        ax2.text(bar.get_x() + bar.get_width() / 2, value, str(value), ha='center', va='bottom', fontsize=9)

    detail = (
        f"sent={result.get('sentTotal', 0)}  "
        f"acks={result.get('acks', 0)}  "
        f"lost={result.get('lostCount', 0)}  "
        f"avg={stats.get('avgRttMs', 0)}ms  "
        f"p95={stats.get('p95RttMs', 0)}ms  "
        f"p99={stats.get('p99RttMs', 0)}ms"
    )
    fig.text(0.5, 0.02, detail, ha='center', fontsize=10)

    fig.tight_layout(rect=(0, 0.04, 1, 0.95))
    chart_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(chart_path, bbox_inches='tight')
    plt.close(fig)


def main() -> int:
    if len(sys.argv) != 3:
      print('Usage: plot_test_results.py <result.json> <chart.png>', file=sys.stderr)
      return 1

    result_path = Path(sys.argv[1])
    chart_path = Path(sys.argv[2])
    result = load_result(result_path)
    plot_result(result, chart_path)
    print(f'plotted {result_path.name} -> {chart_path}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())