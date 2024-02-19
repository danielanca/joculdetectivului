type LayoutType = React.ComponentType | null;
type ComponentType = React.ComponentType;

export interface publicRoutesType {
  path: string;
  layout: LayoutType;
  component: ComponentType;
}
