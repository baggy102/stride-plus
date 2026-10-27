import ActivityKit
import ExpoModulesCore

// JS(src/native/runActivity.ts)에서 받는 상태. RunActivityAttributes.ContentState로 옮긴다
struct RunStateRecord: Record {
  @Field var distanceKm: Double = 0
  @Field var paceSecPerKm: Double = 0
  @Field var elapsedSec: Double = 0
  /// 경과 시간 기준 시작 시각(epoch ms)
  @Field var timerStartMs: Double = 0
  @Field var paused: Bool = false
  @Field var route: [Double] = []
}

// 기록 중 러닝을 잠금화면·다이내믹 아일랜드 Live Activity로 띄운다(iOS 16.2+, 그 밖에는 아무 일도 하지 않는다)
public class RunActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("RunActivity")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("start") { (runNo: String, state: RunStateRecord) async throws in
      guard #available(iOS 16.2, *) else { return }
      // 앱이 다시 시작돼 남은 Activity가 있으면 정리하고 새로 연다
      for activity in Activity<RunActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      _ = try Activity.request(
        attributes: RunActivityAttributes(runNo: runNo),
        content: ActivityContent(state: RunActivityModule.contentState(state), staleDate: nil),
        pushType: nil
      )
    }

    AsyncFunction("update") { (state: RunStateRecord) async in
      guard #available(iOS 16.2, *) else { return }
      let content = ActivityContent(state: RunActivityModule.contentState(state), staleDate: nil)
      for activity in Activity<RunActivityAttributes>.activities {
        await activity.update(content)
      }
    }

    AsyncFunction("end") { () async in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<RunActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  @available(iOS 16.2, *)
  private static func contentState(_ s: RunStateRecord) -> RunActivityAttributes.ContentState {
    RunActivityAttributes.ContentState(
      distanceKm: s.distanceKm,
      paceSecPerKm: s.paceSecPerKm,
      elapsedSec: s.elapsedSec,
      timerStart: Date(timeIntervalSince1970: s.timerStartMs / 1000),
      paused: s.paused,
      route: s.route
    )
  }
}
