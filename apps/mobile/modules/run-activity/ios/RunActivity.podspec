Pod::Spec.new do |s|
  s.name           = 'RunActivity'
  s.version        = '1.0.0'
  s.summary        = 'Stride+ 러닝 Live Activity(잠금화면·다이내믹 아일랜드) 제어'
  s.description    = '기록 중 러닝을 ActivityKit Live Activity로 시작·갱신·종료한다'
  s.author         = ''
  s.homepage       = 'https://github.com/baggy102/stride-plus'
  s.platform       = :ios, '15.1'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  # ActivityKit은 iOS 16.1부터 있다. 앱 최소 버전(15.1)에서 실행이 막히지 않게 약하게 링크한다
  s.weak_frameworks = 'ActivityKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
