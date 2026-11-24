import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Switch } from 'react-native';
import { useTheme } from './theme';

export default function Home({ pc, rooms, addRoom, open, joinLink }) {
  const { s, c } = useTheme();
  const [tab, setTab] = useState('mine');
  const [dir, setDir] = useState([]);
  const [name, setName] = useState('');
  const [priv, setPriv] = useState(false);
  const [link, setLink] = useState('');
  const [phrase, setPhrase] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setErr(''); setBusy(true);
    try { await fn(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  useEffect(() => { if (tab === 'public') run(async () => setDir(await pc.directory())); }, [tab]);

  const create = () => run(async () => {
    if (!name.trim()) throw new Error('Name the room first.');
    const r = await pc.createRoom(name.trim(), priv ? 'private' : 'public');
    setName(''); addRoom(r); open(r);
  });

  const joinPublic = (r) => run(async () => { await pc.joinPublic(r.id); addRoom(r); open(r); });

  const redeem = () => run(async () => { await joinLink(link.trim()); setLink(''); });

  return (
    <View style={[s.screen, s.pad]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h1}>pchat</Text>
        <Pressable onPress={() => setPhrase(!phrase)}><Text style={s.mut}>{phrase ? 'Hide phrase' : 'Recovery phrase'}</Text></Pressable>
      </View>
      {phrase && <View style={[s.card, { marginTop: 8 }]}><Text style={s.text} selectable>{pc.key.toMnemonic()}</Text></View>}
      <View style={[s.row, { marginVertical: 12 }]}>
        {['mine', 'public'].map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[s.ghost, tab === t && { backgroundColor: c.ac, borderColor: c.ac }]}>
            <Text style={tab === t ? s.btnText : s.text}>{t === 'mine' ? 'My rooms' : 'Public rooms'}</Text>
          </Pressable>
        ))}
      </View>
      {!!err && <Text style={s.err}>{err}</Text>}
      <FlatList
        data={tab === 'mine' ? rooms : dir}
        keyExtractor={(r) => r.id}
        ListEmptyComponent={<Text style={s.mut}>{tab === 'mine' ? 'No rooms yet. Create one below or paste an invite link.' : 'No public rooms yet.'}</Text>}
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => (tab === 'mine' ? open(item) : joinPublic(item))}>
            <Text style={s.text}>{item.name}</Text>
            <Text style={s.mut}>{item.type}</Text>
          </Pressable>
        )}
      />
      <View style={{ gap: 8 }}>
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1 }]} value={name} onChangeText={setName} placeholder="New room name" placeholderTextColor={c.mut} />
          <Text style={s.mut}>Private</Text>
          <Switch value={priv} onValueChange={setPriv} />
        </View>
        <Pressable style={s.btn} onPress={create} disabled={busy}><Text style={s.btnText}>{busy ? 'Working...' : 'Create room'}</Text></Pressable>
        <View style={s.row}>
          <TextInput style={[s.input, { flex: 1 }]} value={link} onChangeText={setLink} placeholder="Paste an invite link" placeholderTextColor={c.mut} autoCapitalize="none" autoCorrect={false} />
          <Pressable style={s.ghost} onPress={redeem} disabled={busy || !link.trim()}><Text style={s.text}>Join</Text></Pressable>
        </View>
      </View>
    </View>
  );
}
