import { useColorScheme, StyleSheet } from 'react-native';

const light = { bg: '#f2f6f7', card: '#ffffff', fg: '#14232b', mut: '#5d7279', line: '#c9d6da', ac: '#0e7c86', acfg: '#ffffff', err: '#a3340f', mine: '#d5eef0' };
const dark = { bg: '#0f1a1f', card: '#16262d', fg: '#e4eef0', mut: '#8ba3aa', line: '#2b414a', ac: '#4dc3cc', acfg: '#06252a', err: '#ff9a76', mine: '#1c3d45' };

export function useTheme() {
  const c = useColorScheme() === 'dark' ? dark : light;
  const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    pad: { padding: 16 },
    h1: { color: c.fg, fontSize: 22, fontWeight: '600' },
    text: { color: c.fg, fontSize: 16 },
    mut: { color: c.mut, fontSize: 13 },
    err: { color: c.err, fontSize: 14, marginVertical: 6 },
    input: { borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.fg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16 },
    btn: { backgroundColor: c.ac, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
    btnText: { color: c.acfg, fontSize: 16, fontWeight: '600' },
    ghost: { borderWidth: 1, borderColor: c.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9, alignItems: 'center' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    card: { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderRadius: 12, padding: 12, marginBottom: 8 },
  });
  return { c, s };
}
