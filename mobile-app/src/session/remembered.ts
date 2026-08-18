import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const PROFILE_KEY = 'talktome.remembered-profile';
const PASSWORD_KEY = 'talktome.remembered-password';

export type RememberedGuest = {
  guestId: string;
  guestProfileUserId: number;
  name: string;
};

export type RememberedProfile = {
  serverAddress: string;
  username: string;
  rememberPassword: boolean;
  allowInsecureLocalTLS?: boolean;
  leftHanded?: boolean;
  talkSelectMode?: boolean;
  guest?: RememberedGuest;
};

export async function loadRememberedProfile(): Promise<(RememberedProfile & { password?: string }) | null> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const profile = JSON.parse(raw) as RememberedProfile;
    const password = profile.rememberPassword ? ((await SecureStore.getItemAsync(PASSWORD_KEY)) ?? undefined) : undefined;
    return { ...profile, password };
  } catch {
    return null;
  }
}

export async function saveRememberedProfile(
  profile: RememberedProfile,
  password?: string,
): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  if (profile.rememberPassword && password) {
    await SecureStore.setItemAsync(PASSWORD_KEY, password);
  } else {
    await SecureStore.deleteItemAsync(PASSWORD_KEY);
  }
}

export async function clearRememberedPassword(): Promise<void> {
  await SecureStore.deleteItemAsync(PASSWORD_KEY);
}

export async function saveRememberedGuest(
  profile: RememberedProfile,
  guest: RememberedGuest | undefined,
): Promise<void> {
  await saveRememberedProfile({ ...profile, guest });
}
