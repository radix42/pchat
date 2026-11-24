import { useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Alert, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from './theme';

export default function Chat({ pc, room, back }) {
  const { s, c } = useTheme();
  const [msgs, setMsgs] = useState([]);
  const [pending, setPending] = useState([]);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const list = await pc.history(room.id);
      setMsgs(list.reverse());
      // a sent message shows as pending until its block is mined and it appears in history
      setPending((p) => p.filter((x) => Date.now() - x.at < 120000 &&
        !list.some((m) => m.from === pc.key.address && m.text === x.text && m.time >= Math.floor(x.at / 1000) - 2)));
    } catch (e) { setErr(e.message); }
  }, [pc, room.id]);

  useEffect(() => {
    load();
    let stop = () => {};
    try { stop = pc.subscribe(room.id, () => load()); } catch {}
    const t = setInterval(load, 15000);
    return () => { stop(); clearInterval(t); };
  }, [load]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setErr('');
    try {
      if (editing) await pc.edit(room.id, editing, body);
      else { await pc.send(room.id, body); setPending((p) => [...p, { at: Date.now(), text: body }]); }
      setText(''); setEditing(null);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const getCoins = async () => {
    try { await pc.joinPublic(room.id); setErr(''); } catch (e) { setErr(e.message); }
  };

  const invite = async () => {
    try { await Share.share({ message: await pc.createInvite(room.id) }); } catch (e) { setErr(e.message); }
  };

  const actions = (m) => {
    if (m.from !== pc.key.address || m.hidden) return;
    Alert.alert('Your message', undefined, [
      { text: 'Edit', onPress: () => { setEditing(m.id); setText(m.text || ''); } },
      { text: 'Hide', style: 'destructive', onPress: () => pc.hide(room.id, m.id).catch((e) => setErr(e.message)) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const rows = [...pending.map((p) => ({ id: 'p' + p.at, pending: true, text: p.text, from: pc.key.address })), ...msgs];

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[s.row, s.pad, { justifyContent: 'space-between' }]}>
        <Pressable onPress={back}><Text style={s.text}>Back</Text></Pressable>
        <Text style={s.h1} numberOfLines={1}>{room.name}</Text>
        {room.type === 'private' ? <Pressable onPress={invite}><Text style={s.text}>Invite</Text></Pressable> : <View style={{ width: 40 }} />}
      </View>
      {!!err && (
        <View style={[s.row, { paddingHorizontal: 16 }]}>
          <Text style={[s.err, { flex: 1 }]}>{err}</Text>
          {room.type === 'public' && /coins/i.test(err) && <Pressable style={s.ghost} onPress={getCoins}><Text style={s.text}>Get coins</Text></Pressable>}
        </View>
      )}
      <FlatList
        inverted
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12 }}
        data={rows}
        keyExtractor={(m) => m.id}
        ListEmptyComponent={<Text style={[s.mut, { textAlign: 'center' }]}>No messages yet.</Text>}
        renderItem={({ item: m }) => {
          const mine = m.from === pc.key.address;
          return (
            <Pressable onLongPress={() => actions(m)} style={[s.card, { alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: mine ? c.mine : c.card }]}>
              {!mine && <Text style={s.mut}>{m.from.slice(0, 8)}</Text>}
              <Text style={m.hidden || m.text === null ? s.mut : s.text}>
                {m.hidden ? 'Hidden by sender (still on the chain)' : m.text === null ? 'Cannot decrypt this message' : m.text}
              </Text>
              <Text style={s.mut}>{m.pending ? 'Sending to the chain...' : m.edited ? 'Edited' : ''}</Text>
            </Pressable>
          );
        }}
      />
      {editing && <Text style={[s.mut, { paddingHorizontal: 16 }]}>Editing a message</Text>}
      <View style={[s.row, s.pad]}>
        <TextInput style={[s.input, { flex: 1 }]} value={text} onChangeText={setText} placeholder="Message" placeholderTextColor={c.mut} onSubmitEditing={send} />
        <Pressable style={s.btn} onPress={send} disabled={busy}><Text style={s.btnText}>{editing ? 'Save' : 'Send'}</Text></Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
