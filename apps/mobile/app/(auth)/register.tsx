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

export default function RegisterScreen() {
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
      <View className="flex-1 items-center justify-center bg-white px-6">
        <Text className="text-3xl font-bold mb-2">회원가입</Text>
        <Text className="text-gray-400 mb-8">Stride+와 함께 달리기를 시작하세요</Text>

        <TextInput
          className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
          placeholder="닉네임"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
          editable={!isLoading}
        />
        <TextInput
          className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-4 text-base"
          placeholder="이메일"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
          editable={!isLoading}
        />
        <TextInput
          className="w-full border border-gray-300 rounded-lg px-4 py-3 mb-2 text-base"
          placeholder="비밀번호 (8자 이상)"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          editable={!isLoading}
        />

        {error ? (
          <Text className="w-full text-red-500 text-sm mb-4">{error}</Text>
        ) : (
          <View className="mb-4" />
        )}

        <Pressable
          className={`w-full rounded-lg py-3 items-center ${isLoading ? 'bg-blue-300' : 'bg-blue-500'}`}
          onPress={() => register(username, email, password)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">가입하기</Text>
          )}
        </Pressable>

        <Link href="/(auth)/login" className="mt-4 text-blue-500 text-sm">
          이미 계정이 있으신가요? 로그인
        </Link>
      </View>
    </KeyboardAvoidingView>
  );
}
