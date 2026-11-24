import { useEffect, useState, useCallback } from 'react';
import { ActivityIndicator, BackHandler, Linking, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { PchatClient, Key } from './src/pchat';
import { GATEWAY_URL } from './src/config';
import { keystore, loadKeyHex, saveKeyHex, loadRooms, saveRooms } from './src/storage';
import { useTheme } from './src/theme';
import Setup from './src/Setup';
import Home from './src/Home';
import Chat from './src/Chat';

function Root() {
  const { s } = useTheme();
  const [phase, setPhase] = useState('loading');
  const [pc, setPc] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [cur, setCur] = useState(null);
  const [note, setNote] = useState('');

  const start = useCallback((key) => {
    setPc(new PchatClient({ gateway: GATEWAY_URL, key, keystore }));
    setPhase('main');
  }, []);

  useEffect(() => {
    (async () => {
      setRooms(await loadRooms());
      const h = await loadKeyHex();
      if (h) start(Key.fromHex(h)); else setPhase('setup');
    })();
  }, [start]);

  const onKey = async (key) => { await saveKeyHex(key.toHex()); start(key); };

  const addRoom = useCallback((r) => setRooms((prev) => {
    if (prev.some((x) => x.id === r.id)) return prev;
    const next = [...prev, { id: r.id, name: r.name, type: r.type }];
    saveRooms(next);
    return next;
  }), []);

  const joinLink = useCallback(async (url) => {
    const r = await pc.redeemInvite(url);
    addRoom(r);
    setCur(r);
  }, [pc, addRoom]);

  // pchat://join/<token>?g=<gateway>#<key>.<epoch> opens the app and redeems the single-use invite
  useEffect(() => {
    if (!pc) return;
    const handle = (url) => { if (url && url.startsWith('pchat://join')) joinLink(url).catch((e) => setNote(e.message)); };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [pc, joinLink]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (cur) { setCur(null); return true; } return false; });
    return () => sub.remove();
  }, [cur]);

  if (phase === 'loading') return <View style={[s.screen, { justifyContent: 'center' }]}><ActivityIndicator /></View>;
  if (phase === 'setup') return <Setup onKey={onKey} />;
  return (
    <View style={s.screen}>
      {!!note && <Text style={[s.err, { paddingHorizontal: 16 }]}>{note}</Text>}
      {cur
        ? <Chat pc={pc} room={cur} back={() => setCur(null)} />
        : <Home pc={pc} rooms={rooms} addRoom={addRoom} open={setCur} joinLink={joinLink} />}
    </View>
  );
}

export default function App() {
  const { s } = useTheme();
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.screen}><Root /></SafeAreaView>
    </SafeAreaProvider>
  );
}
