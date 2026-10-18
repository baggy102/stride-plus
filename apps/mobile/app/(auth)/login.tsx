import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { Wordmark } from '@/components/Wordmark';
import { useColors } from '@/theme/useColors';
import { FONT } from '@/theme/fonts';
import type { Palette } from '@/theme/colors';

// 확정 UI S02 로그인
export default function LoginScreen() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();

  useEffect(() => () => { clearError(); }, []);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.form}>
        <View style={styles.brand}>
          <Wordmark width={141} />
          <Text style={styles.tagline}>러닝 기록을 공유하세요</Text>
        </View>

        <TextInput
          style={styles.input}
          accessibilityLabel="이메일"
          placeholder="이메일"
          placeholderTextColor={c.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />
        <TextInput
          style={styles.input}
          accessibilityLabel="비밀번호"
          placeholder="비밀번호"
          placeholderTextColor={c.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          style={[styles.button, { opacity: isLoading ? 0.8 : 1 }]}
          onPress={() => login(email, password)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </Pressable>

        <Text style={styles.footer}>
          계정이 없으신가요?{' '}
          <Link href="/(auth)/register" style={styles.link}>회원가입</Link>
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg, justifyContent: 'center' },
  form: { paddingHorizontal: 32, gap: 12 },
  brand: { alignItems: 'center', gap: 10, marginBottom: 40 },
  tagline: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: c.text2 },
  input: {
    height: 54,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.input,
    color: c.text,
    fontFamily: FONT.regular,
    fontSize: 15,
  },
  error: { fontFamily: FONT.regular, fontSize: 13, color: c.danger },
  button: {
    marginTop: 12,
    height: 54,
    borderRadius: 10,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { fontFamily: FONT.semibold, fontSize: 16, color: c.ink },
  footer: { marginTop: 14, textAlign: 'center', fontFamily: FONT.regular, fontSize: 13, lineHeight: 20, color: c.text2 },
  link: { fontFamily: FONT.semibold, color: c.value },
});
