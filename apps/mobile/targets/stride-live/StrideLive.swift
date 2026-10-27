import ActivityKit
import SwiftUI
import WidgetKit

// Frost 잠금화면 위젯(캔버스 F-Lock): 서리 카드 안에 경로 점 구름 + 거리 + 페이스 · 시간, 아래 STRIDE+ LIVE · RUN/0427.
// 다이내믹 아일랜드: 축소형은 Ice 점 + 거리, 펼침형은 거리 · 시간 · 페이스 + 경로.
// 서체는 위젯에 앱 글꼴을 넣지 않고 시스템 글꼴로 대신한다(숫자 = 시스템 고정폭 숫자, 라벨 = 시스템 모노).

@main
struct StrideLiveBundle: WidgetBundle {
  var body: some Widget {
    RunLiveActivity()
  }
}

private extension Color {
  init(hex: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity
    )
  }
}

// Frost 토큰(apps/mobile/src/theme/colors.ts와 같은 값)
private struct FrostPalette {
  let card: Color
  let border: Color
  let text: Color
  let muted: Color
  let value: Color
  let head: Color
  let logo: Color
  let warn: Color

  static let dark = FrostPalette(
    card: Color(hex: 0x121922, opacity: 0.92),
    border: Color(hex: 0xDCE6EE, opacity: 0.16),
    text: Color(hex: 0xDCE6EE),
    muted: Color(hex: 0x8E9BA8),
    value: Color(hex: 0x9DBFE0),
    head: Color(hex: 0xDCE6EE),
    logo: Color(hex: 0x9DBFE0),
    warn: Color(hex: 0xFFC66B)
  )

  static let light = FrostPalette(
    card: Color(hex: 0xFFFFFF, opacity: 0.92),
    border: Color(hex: 0x0B1016, opacity: 0.08),
    text: Color(hex: 0x0B1016),
    muted: Color(hex: 0x5D6976),
    value: Color(hex: 0x24476B),
    head: Color(hex: 0x24476B),
    logo: Color(hex: 0x24476B),
    warn: Color(hex: 0xB45309)
  )
}

private func formatPace(_ secPerKm: Double) -> String {
  guard secPerKm > 0, secPerKm.isFinite, secPerKm <= 3600 else { return "--'--\"" }
  let total = Int(secPerKm.rounded())
  return String(format: "%d'%02d\"", total / 60, total % 60)
}

private func formatElapsed(_ sec: Double) -> String {
  let total = max(0, Int(sec))
  return String(format: "%02d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
}

private func formatDistance(_ km: Double) -> String {
  String(format: "%.2f", km)
}

// 0~1로 맞춘 경로 점을 점선으로(점 구름처럼) 그리고 지금 위치에 글로우 점
private struct RouteCloud: View {
  let route: [Double]
  let color: Color
  let head: Color

  var body: some View {
    GeometryReader { geo in
      let pts = points(in: geo.size)
      ZStack {
        Path { path in
          for (i, pt) in pts.enumerated() {
            if i == 0 { path.move(to: pt) } else { path.addLine(to: pt) }
          }
        }
        .stroke(color.opacity(0.75), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [0.5, 3]))
        if let last = pts.last {
          Circle()
            .fill(head)
            .frame(width: 6, height: 6)
            .shadow(color: head.opacity(0.9), radius: 5)
            .position(last)
        }
      }
    }
  }

  private func points(in size: CGSize) -> [CGPoint] {
    guard route.count >= 2 else { return [] }
    return stride(from: 0, to: route.count - 1, by: 2).map { i in
      CGPoint(x: route[i] * size.width, y: route[i + 1] * size.height)
    }
  }
}

// 시간: 달리는 중에는 잠금화면에서 스스로 흐르고, 일시정지 중에는 멈춘 값
private struct ElapsedText: View {
  let state: RunActivityAttributes.ContentState

  var body: some View {
    if state.paused {
      Text(formatElapsed(state.elapsedSec))
    } else {
      Text(state.timerStart, style: .timer)
    }
  }
}

private struct LockScreenView: View {
  let context: ActivityViewContext<RunActivityAttributes>
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let p = scheme == .dark ? FrostPalette.dark : FrostPalette.light
    let state = context.state
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 18) {
        RouteCloud(route: state.route, color: p.value, head: p.head)
          .frame(width: 96, height: 64)
        VStack(alignment: .leading, spacing: 6) {
          HStack(alignment: .top, spacing: 4) {
            Text(formatDistance(state.distanceKm))
              .font(.system(size: 44, weight: .semibold))
              .monospacedDigit()
              .foregroundColor(p.text)
            Text("KM")
              .font(.system(size: 9, weight: .medium, design: .monospaced))
              .foregroundColor(p.value)
              .padding(.top, 6)
          }
          HStack(spacing: 0) {
            Text("\(formatPace(state.paceSecPerKm))/KM · ")
            ElapsedText(state: state)
          }
          .font(.system(size: 13, weight: .medium, design: .monospaced))
          .monospacedDigit()
          .foregroundColor(p.text)
        }
        Spacer(minLength: 0)
      }
      HStack(spacing: 10) {
        Text("STRIDE+")
          .font(.system(size: 12, weight: .heavy))
          .italic()
          .foregroundColor(p.logo)
        Text(state.paused ? "PAUSED" : "LIVE")
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .tracking(1.4)
          .foregroundColor(state.paused ? p.warn : p.muted)
        Spacer()
        Text("RUN/\(context.attributes.runNo)")
          .font(.system(size: 10, weight: .medium, design: .monospaced))
          .tracking(1.2)
          .foregroundColor(p.muted)
      }
    }
    .padding(.horizontal, 20)
    .padding(.vertical, 16)
    .background(p.card)
    .overlay(
      RoundedRectangle(cornerRadius: 24, style: .continuous).stroke(p.border, lineWidth: 1)
    )
  }
}

struct RunLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RunActivityAttributes.self) { context in
      LockScreenView(context: context)
        .activitySystemActionForegroundColor(FrostPalette.dark.value)
    } dynamicIsland: { context in
      let p = FrostPalette.dark
      let state = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          HStack(alignment: .top, spacing: 3) {
            Text(formatDistance(state.distanceKm))
              .font(.system(size: 32, weight: .semibold))
              .monospacedDigit()
              .foregroundColor(p.text)
            Text("KM")
              .font(.system(size: 9, weight: .medium, design: .monospaced))
              .foregroundColor(p.value)
              .padding(.top, 5)
          }
          .padding(.leading, 4)
        }
        DynamicIslandExpandedRegion(.trailing) {
          VStack(alignment: .trailing, spacing: 2) {
            ElapsedText(state: state)
              .font(.system(size: 15, weight: .medium, design: .monospaced))
              .monospacedDigit()
              .foregroundColor(p.text)
              .multilineTextAlignment(.trailing)
            Text("\(formatPace(state.paceSecPerKm))/KM")
              .font(.system(size: 12, weight: .medium, design: .monospaced))
              .foregroundColor(p.muted)
          }
          .padding(.trailing, 4)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack(alignment: .center) {
            RouteCloud(route: state.route, color: p.value, head: p.head)
              .frame(width: 64, height: 28)
            Spacer()
            Text(state.paused ? "PAUSED" : "RUN/\(context.attributes.runNo)")
              .font(.system(size: 10, weight: .medium, design: .monospaced))
              .tracking(1.2)
              .foregroundColor(state.paused ? p.warn : p.muted)
          }
          .padding(.horizontal, 4)
        }
      } compactLeading: {
        Circle()
          .fill(state.paused ? p.warn : p.value)
          .frame(width: 8, height: 8)
          .shadow(color: p.value.opacity(0.8), radius: 3)
      } compactTrailing: {
        Text(formatDistance(state.distanceKm))
          .font(.system(size: 14, weight: .semibold))
          .monospacedDigit()
          .foregroundColor(p.value)
      } minimal: {
        Circle()
          .fill(state.paused ? p.warn : p.value)
          .frame(width: 8, height: 8)
      }
      .keylineTint(p.value)
    }
  }
}
