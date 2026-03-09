'use client';

import { useRef, useEffect } from 'react';
import { AgentTown } from '../src/index';
import type { ThemeId, OfficeSize, EnvironmentId } from '../src/index';

export interface TownCanvasProps {
  theme?: ThemeId;
  officeSize?: OfficeSize;
  environment?: EnvironmentId;
  onTownReady?: (town: AgentTown) => void;
  onAgentClick?: (agentId: string) => void;
}

export function TownCanvas({
  theme = 'hybrid',
  officeSize = 'small',
  environment = 'office',
  onTownReady,
  onAgentClick,
}: TownCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const townRef = useRef<AgentTown | null>(null);

  useEffect(() => {
    if (!containerRef.current || townRef.current) return;

    const town = new AgentTown({
      container: containerRef.current,
      theme,
      officeSize,
      environment,
      onAgentClick,
    });

    townRef.current = town;
    onTownReady?.(town);

    return () => {
      town.destroy();
      townRef.current = null;
    };
    // Only mount once — env/theme/size changes are handled via town methods
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} style={{ flex: 1, minWidth: 0 }} />;
}
