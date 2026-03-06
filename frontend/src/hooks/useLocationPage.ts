import { useLocation, useNavigate } from 'react-router-dom'
import { useCallback, useMemo } from 'react'
import type { Page } from '../store/useAppStore'

const PATH_TO_PAGE: Record<string, Page> = {
  '/': 'home',
  '/monitor': 'monitor',
  '/traces': 'traces',
  '/scores': 'scores',
  '/agents': 'agents',
  '/test-suites': 'test-suites',
  '/eval-center': 'eval-center',
  '/settings': 'settings',
  '/eval-framework': 'eval-framework',
  '/comparisons': 'comparisons',
  '/bad-cases': 'bad-cases',
  '/skills-analysis': 'skills-analysis',
  '/playground': 'playground',
  '/experiments': 'experiments',
  '/insights': 'insights',
  '/online-eval': 'online-eval',
  '/annotations': 'annotations',
}

const PAGE_TO_PATH: Record<Page, string> = {
  'home': '/',
  'monitor': '/monitor',
  'traces': '/traces',
  'scores': '/scores',
  'agents': '/agents',
  'test-suites': '/test-suites',
  'eval-center': '/eval-center',
  'settings': '/settings',
  'eval-framework': '/eval-framework',
  'comparisons': '/comparisons',
  'bad-cases': '/bad-cases',
  'skills-analysis': '/skills-analysis',
  'playground': '/playground',
  'experiments': '/experiments',
  'insights': '/insights',
  'online-eval': '/online-eval',
  'annotations': '/annotations',
}

export function useLocationPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const page = useMemo<Page>(() => {
    const basePath = '/' + (location.pathname.split('/')[1] || '')
    return PATH_TO_PAGE[basePath] || 'home'
  }, [location.pathname])

  const setPage = useCallback((p: Page) => {
    navigate(PAGE_TO_PATH[p] || '/')
  }, [navigate])

  return { page, setPage }
}
