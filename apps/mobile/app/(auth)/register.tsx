import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Link } from 'expo-router';
import { useAuthStore } from '@/store/auth';
import { AppLogo } from '@/components/AppLogo';
import { useColors } from '@/theme/useColors';

export default function RegisterScreen() {
  const c = useColors();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();

  useEffect(() => () => { clearError(); }, []);

  return (
    <KeyboardAvoidingView
      className="flex-1"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 items-center justify-center bg-brand-dark px-6">

        {/* 로고 */}
        <View className="mb-3">
          <AppLogo size="lg" />
        </View>
        <Text className="text-brand-text-secondary mb-10">Stride+와 함께 달리기를 시작하세요</Text>

        {/* 닉네임 인풋 */}
        <TextInput
          className="w-full bg-brand-surface text-brand-text-primary rounded-lg px-4 py-4 mb-3 text-base"
          placeholder="닉네임"
          placeholderTextColor={c.text2}
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          editable={!isLoading}
        />

        {/* 이메일 인풋 */}
        <TextInput
          className="w-full bg-brand-surface text-brand-text-primary rounded-lg px-4 py-4 mb-3 text-base"
          placeholder="이메일"
          placeholderTextColor={c.text2}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />

        {/* 비밀번호 인풋 */}
        <TextInput
          className="w-full bg-brand-surface text-brand-text-primary rounded-lg px-4 py-4 mb-2 text-base"
          placeholder="비밀번호 (8자 이상)"
          placeholderTextColor={c.text2}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
        />

        {error ? (
          <Text className="w-full text-red-400 text-sm mb-4">{error}</Text>
        ) : (
          <View className="mb-4" />
        )}

        {/* 가입 버튼 */}
        <Pressable
          style={{ backgroundColor: isLoading ? c.muted : c.accent }}
          className="w-full rounded-lg py-4 items-center active:opacity-80"
          onPress={() => register(username, email, password)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color={c.ink} />
          ) : (
            <Text style={{ color: c.ink }} className="font-bold text-base">가입하기</Text>
          )}
        </Pressable>

        <Link href="/(auth)/login" className="mt-5 text-sm" style={{ color: c.value }}>
          이미 계정이 있으신가요? 로그인
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
