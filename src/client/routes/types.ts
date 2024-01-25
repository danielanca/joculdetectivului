
type LayoutType = React.ComponentType | null;
type ComponentType = React.ComponentType;

export interface publicRoutesType {
    path: string;
    layout: LayoutType;
    component: ComponentType; // component is optional because it's missing in one of your routes
}