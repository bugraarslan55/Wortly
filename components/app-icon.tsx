import type { ComponentType } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import {
  ArrowRight, AudioLines, BadgeCheck, Bell, BookOpen, Briefcase, Bus, ChartColumn,
  ChevronLeft, ChevronRight, Circle, CircleCheck, CircleQuestionMark, CircleUser, CircleX,
  Copy, EyeOff, Flame, Hand, Hash, House, Inbox, Layers, Library, Lightbulb, List, Lock,
  Mail, MapPin, MessagesSquare, Mic, Palette, Pause, PencilLine, Play, Quote, RefreshCw,
  RotateCw, Search, Square, SquarePen, Target, ThumbsUp, Trash, Trophy, Turtle, Users,
  Utensils, Volume2,
} from 'lucide-react-native';
import { Colors } from '../constants/theme';

// Tek ikon sistemi: iOS, Android ve web'de aynı SVG çizimleri kullanılır.
// Uygulama genelinde ikon adları SF Symbols adlarıyla tutulur (bkz. constants/symbols.ts);
// burada bu adlar ortak Lucide ikonlarına eşlenir. SF Symbols çizimleri kopyalanmaz.
// `solid` ikonlar dolu çizilir; diğerleri çizgi (stroke) ikonlardır. Yeni bir ikon adı
// eklenirse buraya da eklenmelidir.
type LucideIcon = ComponentType<{ size?: number; color?: string; strokeWidth?: number; fill?: string }>;
type IconDef = { Icon: LucideIcon; solid?: boolean };

const ICONS: Record<string, IconDef> = {
  'house': { Icon: House },
  'house.fill': { Icon: House },
  'rectangle.stack': { Icon: Layers },
  'rectangle.stack.fill': { Icon: Layers },
  'text.book.closed': { Icon: BookOpen },
  'text.book.closed.fill': { Icon: BookOpen },
  'books.vertical.fill': { Icon: Library },
  'chevron.right': { Icon: ChevronRight },
  'chevron.left': { Icon: ChevronLeft },
  'arrow.right': { Icon: ArrowRight },
  'arrow.clockwise': { Icon: RotateCw },
  'arrow.triangle.2.circlepath': { Icon: RefreshCw },
  'magnifyingglass': { Icon: Search },
  'xmark.circle.fill': { Icon: CircleX },
  'checkmark.circle.fill': { Icon: CircleCheck },
  'checkmark.seal.fill': { Icon: BadgeCheck },
  'questionmark.circle': { Icon: CircleQuestionMark },
  'circle.fill': { Icon: Circle, solid: true },
  'tortoise.fill': { Icon: Turtle },
  'speaker.wave.2.fill': { Icon: Volume2 },
  'waveform': { Icon: AudioLines },
  'mic.fill': { Icon: Mic },
  'play.fill': { Icon: Play, solid: true },
  'pause.fill': { Icon: Pause, solid: true },
  'stop.fill': { Icon: Square, solid: true },
  'lock.fill': { Icon: Lock },
  'trash': { Icon: Trash },
  'square.and.pencil': { Icon: SquarePen },
  'pencil.line': { Icon: PencilLine },
  'rectangle.on.rectangle.angled': { Icon: Copy },
  'text.quote': { Icon: Quote },
  'list.bullet': { Icon: List },
  'tray': { Icon: Inbox },
  'person.crop.circle.fill': { Icon: CircleUser },
  'person.3.fill': { Icon: Users },
  'mappin.and.ellipse': { Icon: MapPin },
  'flame.fill': { Icon: Flame, solid: true },
  'scope': { Icon: Target },
  'envelope.fill': { Icon: Mail },
  'chart.bar.fill': { Icon: ChartColumn },
  'bubble.left.and.bubble.right.fill': { Icon: MessagesSquare },
  'bell.fill': { Icon: Bell },
  'trophy.fill': { Icon: Trophy },
  'hand.thumbsup.fill': { Icon: ThumbsUp },
  'hand.wave.fill': { Icon: Hand },
  'lightbulb.fill': { Icon: Lightbulb },
  'eye.slash.fill': { Icon: EyeOff },
  'number': { Icon: Hash },
  'paintpalette.fill': { Icon: Palette },
  'fork.knife': { Icon: Utensils },
  'bus.fill': { Icon: Bus },
  'briefcase.fill': { Icon: Briefcase },
};

type AppIconProps = {
  name: string;
  size?: number;
  color?: string;
  label?: string;
  style?: StyleProp<ViewStyle>;
};

export function AppIcon({
  name,
  size = 20,
  color = Colors.primary,
  label,
  style,
}: AppIconProps) {
  const def = ICONS[name];
  if (!def) {
    if (__DEV__) console.warn(`[Wortly] "${name}" için ikon tanımı yok.`);
    return null;
  }
  const { Icon, solid } = def;

  return (
    <View
      accessible={Boolean(label)}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      style={[{ width: size, height: size }, style]}
    >
      <Icon size={size} color={color} strokeWidth={2} fill={solid ? color : 'none'} />
    </View>
  );
}
