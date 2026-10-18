import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/auth';
import { BackIcon, CheckIcon, EyeIcon } from '@/components/icons';
import { LEGAL_DOCS, type LegalKey } from '@/config/legal';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';

const EMAIL_PATTERN = /.+@.+\..+/;
const NO_AGREEMENTS: Record<LegalKey, boolean> = { terms: false, privacy: false, location: false };

// 서버 오류 메시지 → 화면 문구. step은 고칠 입력이 있는 단계
function describeError(error: string): { text: string; step: 1 | 2 } {
  if (error === 'banned_word') return { text: '닉네임에 사용할 수 없는 단어가 있어요.', step: 1 };
  if (error === 'Email already in use') return { text: '이미 가입된 이메일이에요.', step: 1 };
  if (error === 'consent_required') return { text: '약관 동의가 필요해요. 앱을 최신 버전으로 업데이트해 주세요.', step: 2 };
  return { text: error, step: 2 };
}

function Checkbox({ on, c }: { on: boolean; c: Palette }) {
  return (
    <View
      style={{
        width: 26, height: 26, borderRadius: 8, borderWidth: 2,
        borderColor: on ? c.accent : c.text2, backgroundColor: on ? c.accent : 'transparent',
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      {on && <CheckIcon size={26} color={c.ink} />}
    </View>
  );
}

// 확정 UI S03 회원가입 — 1단계 정보 입력, 2단계 필수 약관 동의(캔버스 추가 화면 ①)
export default function RegisterScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2>(1);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(NO_AGREEMENTS);
  const [noticeVisible, setNoticeVisible] = useState(false);
  const { register, isLoading, error, clearError } = useAuthStore();

  useEffect(() => () => { clearError(); }, []);

  const described = error ? describeError(error) : null;
  // 1단계 입력 문제로 거절되면 1단계로 돌려보낸다
  useEffect(() => {
    if (described?.step === 1) setStep(1);
  }, [error]);

  const step1Valid = username.trim().length >= 2 && EMAIL_PATTERN.test(email) && password.length >= 8;
  const allAgreed = LEGAL_DOCS.every((doc) => agreed[doc.key]);

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (router.canGoBack()) router.back();
    else router.replace('/(auth)/login');
  };

  const submit = () => {
    if (!allAgreed || isLoading) return;
    register(username.trim(), email.trim(), password);
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step === 1 ? '로그인으로 돌아가기' : '정보 입력으로 돌아가기'}
          onPress={goBack}
          style={styles.iconBtn}
        >
          <BackIcon size={24} color={c.text} />
        </Pressable>
        <View style={styles.progress} accessibilityLabel={`${step}단계 / 2단계`}>
          <View style={styles.progressBars}>
            <View style={[styles.progressBar, styles.progressOn]} />
            <View style={[styles.progressBar, { backgroundColor: step === 2 ? c.value : c.surface2 }]} />
          </View>
          <Text style={styles.progressLabel}>{step} / 2</Text>
        </View>
      </View>

      {step === 1 ? (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.titleBlock}>
            <Text style={styles.title}>계정 만들기</Text>
            <Text style={styles.subtitle}>가입 정보를 입력해 주세요.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>닉네임</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="닉네임"
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={(text) => { setUsername(text); if (error) clearError(); }}
              editable={!isLoading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>이메일</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="이메일"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={(text) => { setEmail(text); if (error) clearError(); }}
              editable={!isLoading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>비밀번호</Text>
            <View style={[styles.input, styles.passwordRow]}>
              <TextInput
                style={styles.passwordInput}
                accessibilityLabel="비밀번호"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
                onPress={() => setShowPassword((v) => !v)}
                style={styles.iconBtn}
              >
                <EyeIcon color={c.text2} />
              </Pressable>
            </View>
            <Text style={styles.hint}>8자 이상</Text>
          </View>

          {described?.step === 1 ? <Text style={styles.error}>{described.text}</Text> : null}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>약관에 동의해 주세요</Text>
            <Text style={styles.subtitle}>가입하려면 필수 항목 3개에 모두 동의해야 해요.</Text>
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: allAgreed }}
            onPress={() => setAgreed(allAgreed ? NO_AGREEMENTS : { terms: true, privacy: true, location: true })}
            style={styles.allCard}
          >
            <Checkbox on={allAgreed} c={c} />
            <Text style={styles.allLabel}>전체 동의</Text>
          </Pressable>

          <View>
            {LEGAL_DOCS.map((doc) => (
              <View key={doc.key} style={styles.agreeRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: agreed[doc.key] }}
                  accessibilityLabel={`[필수] ${doc.label}`}
                  onPress={() => setAgreed((prev) => ({ ...prev, [doc.key]: !prev[doc.key] }))}
                  style={styles.agreeToggle}
                >
                  <Checkbox on={agreed[doc.key]} c={c} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agreeLabel}>
                      <Text style={styles.required}>[필수]</Text> {doc.label}
                    </Text>
                    <Text style={styles.agreeSub}>{doc.sub}</Text>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${doc.label} 보기`}
                  onPress={() => setNoticeVisible(true)}
                  style={styles.viewBtn}
                >
                  <Text style={styles.viewText}>보기</Text>
                </Pressable>
              </View>
            ))}
          </View>

          {described?.step === 2 ? <Text style={styles.error}>{described.text}</Text> : null}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {/* 약관 공개 페이지(F5) 전까지 안내만 띄운다 — 캔버스 결정 */}
        {step === 2 && noticeVisible && (
          <Pressable accessibilityRole="button" onPress={() => setNoticeVisible(false)} style={styles.notice}>
            <Text style={styles.noticeText}>약관 페이지 준비 중입니다</Text>
            <Text style={styles.noticeClose}>닫기</Text>
          </Pressable>
        )}
        {step === 1 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !step1Valid }}
            disabled={!step1Valid}
            onPress={() => { clearError(); setStep(2); }}
            style={[styles.button, !step1Valid && styles.buttonDisabled]}
          >
            <Text style={[styles.buttonText, !step1Valid && styles.buttonTextDisabled]}>다음</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !allAgreed || isLoading }}
            disabled={!allAgreed || isLoading}
            onPress={submit}
            style={[styles.button, !allAgreed && styles.buttonDisabled]}
          >
            {isLoading ? (
              <ActivityIndicator color={c.ink} />
            ) : (
              <Text style={[styles.buttonText, !allAgreed && styles.buttonTextDisabled]}>가입하기</Text>
            )}
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  header: { paddingHorizontal: 8, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 16 },
  progressBars: { flexDirection: 'row', gap: 4 },
  progressBar: { width: 20, height: 4, borderRadius: 2 },
  // 팔레트 토큰 이름이 value라 인라인 { color: c.value }는 reanimated 플러그인이 shared value로 오인해 경고한다 → StyleSheet로
  progressOn: { backgroundColor: c.value },
  progressLabel: { fontFamily: FONT.num, fontSize: 14, lineHeight: 18, color: c.text2 },
  body: { paddingHorizontal: 24, paddingTop: 17, paddingBottom: 24, gap: 24 },
  titleBlock: { gap: 6 },
  title: { fontFamily: FONT.semibold, fontSize: 22, lineHeight: 30, color: c.text },
  subtitle: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, color: c.text2 },
  field: { gap: 4 },
  label: { fontFamily: FONT.semibold, fontSize: 13, lineHeight: 18, color: c.text2 },
  input: {
    height: 54, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: c.border,
    backgroundColor: c.input, color: c.text, fontFamily: FONT.regular, fontSize: 16,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 4 },
  passwordInput: { flex: 1, height: 52, color: c.text, fontFamily: FONT.regular, fontSize: 16 },
  hint: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  error: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, color: c.danger },
  allCard: {
    marginHorizontal: -8, height: 64, paddingHorizontal: 16, borderRadius: 16,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.border,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  allLabel: { fontFamily: FONT.semibold, fontSize: 16, lineHeight: 22, color: c.text },
  agreeRow: {
    marginHorizontal: -8, minHeight: 60, paddingLeft: 16, flexDirection: 'row', alignItems: 'center', gap: 4,
    borderBottomWidth: 1, borderBottomColor: c.border,
  },
  agreeToggle: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 14 },
  agreeLabel: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 20, color: c.text },
  required: { fontFamily: FONT.semibold, color: c.value },
  agreeSub: { fontFamily: FONT.regular, fontSize: 12, lineHeight: 16, color: c.text2 },
  viewBtn: { height: 44, paddingHorizontal: 12, justifyContent: 'center' },
  viewText: { fontFamily: FONT.semibold, fontSize: 14, color: c.text2, textDecorationLine: 'underline' },
  footer: { paddingHorizontal: 24, paddingTop: 8, gap: 12 },
  notice: {
    marginHorizontal: -8, height: 56, paddingHorizontal: 16, borderRadius: 16,
    borderWidth: 1, borderColor: c.border, backgroundColor: c.surface2,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  noticeText: { fontFamily: FONT.regular, fontSize: 15, color: c.text },
  noticeClose: { fontFamily: FONT.semibold, fontSize: 15, color: c.text2 },
  button: { height: 54, borderRadius: 10, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { backgroundColor: c.surface2 },
  buttonText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  buttonTextDisabled: { color: c.muted },
});
