'use client';
import { useSyncExternalStore } from 'react';
import { isPageActive, subscribePageActivity } from '../src/page-activity';

const inactiveOnServer = () => false;

export function usePageActive() {
  return useSyncExternalStore(subscribePageActivity, isPageActive, inactiveOnServer);
}
