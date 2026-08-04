import Svg, { Path, type SvgProps } from 'react-native-svg';

type FlowLogoMarkProps = SvgProps & {
  color: string;
  height?: number;
  size?: number;
  width?: number;
};

export function FlowLogoMark({ color, height, size = 108, width, ...props }: FlowLogoMarkProps) {
  const markWidth = width ?? size;
  const markHeight = height ?? Math.round(markWidth * 0.44);

  return (
    <Svg
      accessibilityLabel="Simbolo do aplicativo"
      height={markHeight}
      viewBox="0 0 680 300"
      width={markWidth}
      {...props}
    >
      <Path
        d="M128 118 L128 186"
        fill="none"
        opacity={0.72}
        stroke={color}
        strokeLinecap="round"
        strokeWidth={36}
      />
      <Path
        d="M242 74 L242 230"
        fill="none"
        opacity={0.9}
        stroke={color}
        strokeLinecap="round"
        strokeWidth={38}
      />
      <Path
        d="M354 108 L354 196"
        fill="none"
        opacity={0.78}
        stroke={color}
        strokeLinecap="round"
        strokeWidth={36}
      />
      <Path
        d="M466 62 L466 242"
        fill="none"
        opacity={1}
        stroke={color}
        strokeLinecap="round"
        strokeWidth={40}
      />
      <Path
        d="M580 122 L580 182"
        fill="none"
        opacity={0.7}
        stroke={color}
        strokeLinecap="round"
        strokeWidth={34}
      />
    </Svg>
  );
}
