// Polyfills must load before the client library: it needs getRandomValues, URL, and TextEncoder/Decoder.
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import 'fast-text-encoding';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
