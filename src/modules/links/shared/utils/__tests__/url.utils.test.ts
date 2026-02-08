import { extractTitleFromUrl } from '../url.utils'

describe('extractTitleFromUrl', () => {
  it('should return hostname for root URL', () => {
    expect(extractTitleFromUrl('https://example.com/')).toBe('example.com')
  })

  it('should return hostname for URL without path', () => {
    expect(extractTitleFromUrl('https://example.com')).toBe('example.com')
  })

  it('should strip www. from hostname', () => {
    expect(extractTitleFromUrl('https://www.example.com/')).toBe('example.com')
  })

  it('should extract path segments with slug cleanup', () => {
    expect(extractTitleFromUrl('https://blog.example.com/posts/my-great-article')).toBe(
      'blog.example.com - posts/my great article'
    )
  })

  it('should handle underscores in path', () => {
    expect(extractTitleFromUrl('https://example.com/some_page_title')).toBe(
      'example.com - some page title'
    )
  })

  it('should handle GitHub-style URLs', () => {
    expect(extractTitleFromUrl('https://github.com/user/repo')).toBe(
      'github.com - user/repo'
    )
  })

  it('should strip file extensions from segments', () => {
    expect(extractTitleFromUrl('https://example.com/docs/guide.html')).toBe(
      'example.com - docs/guide'
    )
  })

  it('should filter out very short segments', () => {
    expect(extractTitleFromUrl('https://example.com/a/real-content')).toBe(
      'example.com - real content'
    )
  })

  it('should return hostname if all segments are too short', () => {
    expect(extractTitleFromUrl('https://example.com/a/b')).toBe('example.com')
  })

  it('should return raw URL for invalid URLs', () => {
    expect(extractTitleFromUrl('not-a-url')).toBe('not-a-url')
  })

  it('should handle URL-encoded characters', () => {
    expect(extractTitleFromUrl('https://example.com/caf%C3%A9-guide')).toBe(
      'example.com - café guide'
    )
  })

  it('should handle http protocol', () => {
    expect(extractTitleFromUrl('http://example.com/page')).toBe(
      'example.com - page'
    )
  })
})
