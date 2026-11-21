"use client"

import { createContext, type RefObject } from "react"

/** Keep a page's floating controls inside the element that governs its visibility. */
export const PortalContainer = createContext<RefObject<HTMLElement | null> | undefined>(undefined)
