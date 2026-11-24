import { beforeEach, describe, expect, it } from 'vitest'
import type { DownloadInfo } from '../../src/shared/types'
import { openMemoryDatabase } from '../../src/main/store/db'
import { DownloadsStore } from '../../src/main/store/downloads'

let store: DownloadsStore
beforeEach(() => {
  store = new DownloadsStore(openMemoryDatabase())
})

const download = (id: string, startedAt: number, extra: Partial<DownloadInfo> = {}): DownloadInfo => ({
  id,
  url: `https://files.test/${id}`,
  filename: `${id}.zip`,
  path: `/tmp/${id}.zip`,
  state: 'completed',
  receivedBytes: 10,
  totalBytes: 10,
  startedAt,
  ...extra
})

describe('DownloadsStore', () => {
  it('updates a download when it ends', () => {
    store.save(download('a', 1000, { state: 'progressing', receivedBytes: 0 }))
    store.save(download('a', 1000, { filename: 'a (1).zip', path: '/tmp/a (1).zip' }), 2000)
    expect(store.get('a')).toMatchObject({ state: 'completed', filename: 'a (1).zip', receivedBytes: 10, startedAt: 1000 })
  })

  it('searches names and addresses, newest first, with paging', () => {
    store.save(download('rapport', 1000))
    store.save(download('photos', 2000, { url: 'https://cloud.test/x' }))
    store.save(download('rapport-2', 3000))
    expect(store.search('rapport').map((d) => d.id)).toEqual(['rapport-2', 'rapport'])
    expect(store.search('cloud').map((d) => d.id)).toEqual(['photos'])
    expect(store.search('', 3000).map((d) => d.id)).toEqual(['photos', 'rapport'])
    expect(store.search('100%')).toEqual([])
  })

  it('marks downloads cut by a quit as failed', () => {
    store.save(download('a', 3000, { state: 'progressing' }))
    store.save(download('b', 2000, { state: 'paused' }))
    store.save(download('c', 1000))
    store.markUnfinishedInterrupted()
    expect(store.search('').map((d) => [d.id, d.state])).toEqual([
      ['a', 'interrupted'],
      ['b', 'interrupted'],
      ['c', 'completed']
    ])
  })

  it('clears finished downloads of a period, never the running ones', () => {
    const now = 10 * 86_400_000
    store.save(download('old', now - 3 * 86_400_000))
    store.save(download('recent', now - 1000))
    store.save(download('running', now - 500, { state: 'progressing' }))
    store.clear('day', now)
    expect(store.search('').map((d) => d.id)).toEqual(['running', 'old'])
    store.clear('all', now)
    expect(store.search('').map((d) => d.id)).toEqual(['running'])
    store.remove('running')
    expect(store.search('')).toEqual([])
  })
})
