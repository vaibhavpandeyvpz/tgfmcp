import React from "react";
import { Box, Text } from "ink";
import type { MenuItem } from "../types.js";
import { MenuScreen } from "./MenuScreen.js";

type HomeScreenProps = {
  rootPath: string;
  configPath: string;
  items: MenuItem[];
};

export function HomeScreen({
  rootPath,
  configPath,
  items,
}: HomeScreenProps): React.JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">
        <Text bold>root:</Text> {rootPath}
      </Text>
      <Text color="gray">
        <Text bold>config.json:</Text> {configPath}
      </Text>
      <MenuScreen items={items} footerHint="enter: select | ctrl+c: exit" />
    </Box>
  );
}
