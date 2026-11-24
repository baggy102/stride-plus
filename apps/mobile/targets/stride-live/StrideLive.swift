import ActivityKit
import SwiftUI
import WidgetKit

// 잠금화면 Live Activity: CG-3 「기운 판」(SPEC_LA4 7절) + 2026-11-24 수정.
// - 왼쪽 수치 기둥 L2 「균등 분배」: 위 워드마크 그림(「● REC」 자리), 가운데 거리 + KM, 아래 TIME · PACE 두 줄. 나눔 선 없음.
// - 오른쪽: 원근으로 눕힌 24 격자 판 위 경로 선 v2, 빛 머리 · 빛 기둥 · 빛 공기. 판은 카드 오른쪽 밖으로 이어진다.
// - 일시정지: 워드마크 줄 오른쪽에 작은 warn 「PAUSED」, 머리가 warn. 달리는 중에는 상태 글자 없음.
// 다이내믹 아일랜드: 축소형 · 최소형은 평평한 미니 경로(선 v2 축소판), 펼친 모습은 왼쪽 수치 + 오른쪽 기운 판.
// 카드는 라이트 모드에서도 어두운 tint. 자리 값은 LiveStyle.swift(LockColumn · IslandColumn · PlaneSpec).

@main
struct StrideLiveBundle: WidgetBundle {
  var body: some Widget {
    RunLiveActivity()
  }
}

/// 시간: 달리는 중에는 잠금화면에서 스스로 흐르고, 일시정지 중에는 멈춘 값(같은 분:초 모양)
private struct ElapsedText: View {
  let state: RunActivityAttributes.ContentState

  var body: some View {
    if state.paused {
      Text(LiveFormat.elapsed(state.elapsedSec))
    } else {
      Text(state.timerStart, style: .timer)
    }
  }
}

/// TIME · PACE 한 줄: 모노 라벨 + Barlow 값, 같은 바닥선
private struct StatLine<Value: View>: View {
  let label: String
  let labelX: CGFloat
  let valueX: CGFloat
  let baseline: CGFloat
  let size: CGSize
  @ViewBuilder let value: () -> Value

  var body: some View {
    ZStack(alignment: .topLeading) {
      Text(label)
        .font(LiveFont.mono(LockColumn.labelSize))
        .tracking(LockColumn.labelTracking)
        .foregroundColor(LiveColor.text2)
        .pinned(x: labelX, baseline: baseline, in: size)
      value()
        .font(LiveFont.num(LockColumn.valueSize))
        .foregroundColor(LiveColor.text)
        .lineLimit(1)
        .multilineTextAlignment(.leading)
        .frame(width: LockColumn.valueWidth, alignment: .leading)
        .pinned(x: valueX, baseline: baseline, in: size)
    }
  }
}

/// 잠금화면 왼쪽 수치 기둥(L2). size = 카드 크기
private struct LockColumnView: View {
  let state: RunActivityAttributes.ContentState
  let size: CGSize

  var body: some View {
    let valueX = LockColumn.x + LockColumn.labelWidth + LockColumn.labelGap
    ZStack(alignment: .topLeading) {
      Wordmark(width: LockColumn.wordmarkWidth, color: LiveColor.logo)
        .pinned(x: LockColumn.x, top: LockColumn.padTop, in: size)
      if state.paused {
        Text("PAUSED")
          .font(LiveFont.mono(LockColumn.pausedSize))
          .tracking(LockColumn.pausedTracking)
          .foregroundColor(LiveColor.warn)
          .pinned(right: LockColumn.x + LockColumn.width, baseline: LockColumn.pausedBaseline, in: size)
      }
      LockColumn.distance.text(LiveFormat.distance(state.distanceKm))
        .pinned(x: LockColumn.x, baseline: LockColumn.distanceBaseline, in: size)
      StatLine(label: "TIME", labelX: LockColumn.x, valueX: valueX, baseline: LockColumn.timeBaseline, size: size) {
        ElapsedText(state: state)
      }
      StatLine(label: "PACE", labelX: LockColumn.x, valueX: valueX, baseline: LockColumn.paceBaseline, size: size) {
        Text(LiveFormat.pace(state.paceSecPerKm))
      }
    }
    .frame(width: size.width, height: size.height, alignment: .topLeading)
  }
}

private struct LockScreenView: View {
  let state: RunActivityAttributes.ContentState

  var body: some View {
    GeometryReader { geo in
      ZStack(alignment: .topLeading) {
        TiltedPlaneView(
          route: state.route,
          distanceKm: state.distanceKm,
          paused: state.paused,
          spec: .lock(width: geo.size.width),
          size: geo.size
        )
        .accessibilityHidden(true)
        LockColumnView(state: state, size: geo.size)
      }
    }
    .frame(height: LockColumn.cardHeight)
    .clipShape(ContainerRelativeShape())
    .overlay {
      ContainerRelativeShape().strokeBorder(LiveColor.border, lineWidth: 1)
    }
  }
}

/// 아일랜드 펼친 모습 왼쪽: 상태 점(+ PAUSED) · 거리 32 + KM · TIME · PACE
private struct IslandColumnView: View {
  let state: RunActivityAttributes.ContentState

  var body: some View {
    let size = CGSize(width: IslandColumn.width, height: IslandColumn.height)
    let dotColor = state.paused ? LiveColor.warn : LiveColor.ice
    ZStack(alignment: .topLeading) {
      Circle()
        .fill(dotColor)
        .frame(width: IslandColumn.dotSize, height: IslandColumn.dotSize)
        .pinned(x: 0, top: IslandColumn.statusCenterY - IslandColumn.dotSize / 2, in: size)
      if state.paused {
        Text("PAUSED")
          .font(LiveFont.mono(IslandColumn.pausedSize))
          .tracking(IslandColumn.pausedTracking)
          .foregroundColor(LiveColor.warn)
          .pinned(
            x: IslandColumn.dotSize + IslandColumn.pausedGap,
            baseline: IslandColumn.statusCenterY + IslandColumn.pausedSize * LiveFont.monoCap / 2,
            in: size
          )
      }
      IslandColumn.distance.text(LiveFormat.distance(state.distanceKm))
        .pinned(x: 0, baseline: IslandColumn.distanceBaseline, in: size)
      StatLine(label: "TIME", labelX: 0, valueX: IslandColumn.valueX, baseline: IslandColumn.timeBaseline, size: size) {
        ElapsedText(state: state)
      }
      StatLine(label: "PACE", labelX: 0, valueX: IslandColumn.valueX, baseline: IslandColumn.paceBaseline, size: size) {
        Text(LiveFormat.pace(state.paceSecPerKm))
      }
    }
    .frame(width: size.width, height: size.height, alignment: .topLeading)
  }
}

struct RunLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunActivityAttributes.self) { context in
      LockScreenView(state: context.state)
        .activityBackgroundTint(LiveColor.tint.opacity(LiveColor.tintOpacity))
        .activitySystemActionForegroundColor(LiveColor.ice)
    } dynamicIsland: { context in
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          IslandColumnView(state: state)
        }
        DynamicIslandExpandedRegion(.trailing, priority: 1) {
          GeometryReader { geo in
            TiltedPlaneView(
              route: state.route,
              distanceKm: state.distanceKm,
              paused: state.paused,
              spec: .island(size: geo.size),
              size: geo.size
            )
          }
          .frame(height: IslandColumn.planeHeight)
          .accessibilityHidden(true)
        }
      } compactLeading: {
        MiniRoute(route: state.route, paused: state.paused, size: IslandColumn.compactRoute)
      } compactTrailing: {
        Text(LiveFormat.distance(state.distanceKm))
          .font(LiveFont.num(IslandColumn.compactDistanceSize))
          .foregroundColor(LiveColor.text)
      } minimal: {
        MiniRoute(route: state.route, paused: state.paused, size: IslandColumn.minimalRoute)
      }
      .keylineTint(LiveColor.ice)
    }
  }
}
