import * as SecureStore from 'expo-secure-store';

const read = async (k, d) => { const v = await SecureStore.getItemAsync(k); return v ? JSON.parse(v) : d; };

export const loadKeyHex = () => SecureStore.getItemAsync('pchat_key');
export const saveKeyHex = (h) => SecureStore.setItemAsync('pchat_key', h);

// Room keys for private rooms. They live only in the device's secure storage.
export const keystore = {
  get: (id) => read('rk_' + id, null),
  set: (id, v) => SecureStore.setItemAsync('rk_' + id, JSON.stringify(v)),
};

export const loadRooms = () => read('rooms', []);
export const saveRooms = (r) => SecureStore.setItemAsync('rooms', JSON.stringify(r));
