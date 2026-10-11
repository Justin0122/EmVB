import {
  ArrowsLeftRightIcon,
  ArrowsVerticalIcon,
  ArticleIcon,
  BrowserIcon,
  CaretCircleDownIcon,
  CaretDownIcon,
  CheckSquareIcon,
  CursorClickIcon,
  GraphIcon,
  GridFourIcon,
  ImageIcon,
  LinkIcon,
  ListBulletsIcon,
  MinusIcon,
  NotePencilIcon,
  PaperPlaneRightIcon,
  RadioButtonIcon,
  RowsIcon,
  SmileyIcon,
  SquareIcon,
  SquaresFourIcon,
  TextAaIcon,
  TextAlignLeftIcon,
  TextboxIcon,
  TextHIcon,
  TextTIcon,
  VideoCameraIcon,
  type Icon,
} from "@phosphor-icons/react";
import { ELEMENT_DESCRIPTORS } from "../../core/index.ts";

/** Labels for element types. One list, from the descriptors (W-361). */
export const ELEMENT_NAMES: Record<string, string> = Object.fromEntries(
  ELEMENT_DESCRIPTORS.map((descriptor) => [descriptor.type, descriptor.name]),
);

/**
 * Phosphor icon for each element. The names in `docs/DESIGN.md` win. Types that table
 * does not list keep the icon the add panel already showed.
 */
export const ELEMENT_ICONS: Record<string, Icon> = {
  container: SquaresFourIcon,
  "div-block": SquareIcon,
  "layout-section": RowsIcon,
  section: RowsIcon,
  flexbox: SquaresFourIcon,
  grid: GridFourIcon,
  spacer: ArrowsVerticalIcon,
  divider: MinusIcon,
  heading: TextHIcon,
  text: TextAlignLeftIcon,
  label: TextTIcon,
  link: LinkIcon,
  button: CursorClickIcon,
  list: ListBulletsIcon,
  image: ImageIcon,
  icon: SmileyIcon,
  svg: GraphIcon,
  tabs: BrowserIcon,
  "tab-panel": BrowserIcon,
  accordion: ListBulletsIcon,
  "accordion-item": ListBulletsIcon,
  menu: CaretDownIcon,
  "menu-item": CaretDownIcon,
  toc: ListBulletsIcon,
  video: VideoCameraIcon,
  form: ArticleIcon,
  "text-input": TextboxIcon,
  textarea: TextAaIcon,
  select: CaretCircleDownIcon,
  checkbox: CheckSquareIcon,
  radio: RadioButtonIcon,
  submit: PaperPlaneRightIcon,
  "post-title": TextHIcon,
  "post-excerpt": TextAlignLeftIcon,
  "post-content": NotePencilIcon,
  "post-image": ImageIcon,
  "post-link": LinkIcon,
  "post-date": TextTIcon,
  "post-author": TextTIcon,
  loop: ListBulletsIcon,
  "loop-empty": SquareIcon,
  pagination: ArrowsLeftRightIcon,
};

export function elementIcon(type: string): Icon {
  return ELEMENT_ICONS[type] ?? SquaresFourIcon;
}
