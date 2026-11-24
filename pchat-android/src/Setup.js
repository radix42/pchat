import { useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Key } from './pchat';
import { useTheme } from './theme';

export default function Setup({ onKey }) {
  const { s, c } = useTheme();
  const [words, setWords] = useState('');
  const [err, setErr] = useState('');
  const [fresh, setFresh] = useState(null);

  if (fresh) {
    return (
      <View style={s.pad}>
        <Text style={s.h1}>Back up your recovery phrase</Text>
        <Text style={[s.mut, { marginVertical: 8 }]}>
          These 24 words are your account. Anyone with them can act as you, and without them a lost phone means a lost identity.
        </Text>
        <View style={s.card}><Text style={s.text} selectable>{fresh.toMnemonic()}</Text></View>
        <Pressable style={s.btn} onPress={() => onKey(fresh)}><Text style={s.btnText}>I saved it, continue</Text></Pressable>
      </View>
    );
  }

  const restore = () => {
    try { onKey(Key.fromMnemonic(words.trim().toLowerCase().replace(/\s+/g, ' '))); }
    catch (e) { setErr(e.message); }
  };

  return (
    <View style={[s.pad, { gap: 12 }]}>
      <Text style={s.h1}>Welcome to pchat</Text>
      <Text style={s.mut}>Your identity is a key that stays on this phone.</Text>
      <Pressable style={s.btn} onPress={() => setFresh(Key.generate())}><Text style={s.btnText}>Create a new identity</Text></Pressable>
      <Text style={[s.mut, { marginTop: 12 }]}>Or restore from your 24-word recovery phrase</Text>
      <TextInput style={[s.input, { minHeight: 90 }]} multiline value={words} onChangeText={(t) => { setWords(t); setErr(''); }}
        placeholder="word1 word2 word3 ..." placeholderTextColor={c.mut} autoCapitalize="none" autoCorrect={false} />
      {!!err && <Text style={s.err}>{err}</Text>}
      <Pressable style={s.ghost} onPress={restore}><Text style={s.text}>Restore identity</Text></Pressable>
    </View>
  );
}
