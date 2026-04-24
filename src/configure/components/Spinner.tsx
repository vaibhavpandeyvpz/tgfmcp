import React from "react";
import { useEffect, useState } from "react";
import { Text } from "ink";
import cliSpinners, { type SpinnerName } from "cli-spinners";

type SpinnerProps = {
  type?: SpinnerName;
  color?: string;
  bold?: boolean;
};

export function Spinner({
  type = "dots",
  color = "cyan",
  bold = true,
}: SpinnerProps): React.JSX.Element {
  const spinner = cliSpinners[type] || cliSpinners.dots;
  const { frames, interval } = spinner;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((value) => (value + 1) % frames.length);
    }, interval);
    return () => {
      clearInterval(timer);
    };
  }, [frames.length, interval]);

  return (
    <Text color={color} bold={bold}>
      {frames[index]}
    </Text>
  );
}
