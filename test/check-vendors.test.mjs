import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

import { readSource, section } from '../scripts/check-vendors.mjs';

test('section accepts a release heading with a MATLAB prefix', () => {
  const text = 'Navigation\nMATLAB R2026b System Requirements for Windows\nRAM\nMinimum: 8 GB\nSelect a Web Site';
  assert.equal(section(text, {
    start: 'R\\d{4}[ab] System Requirements for Windows',
    end: 'Select a Web Site'
  }), 'R2026b System Requirements for Windows\nRAM\nMinimum: 8 GB');
});

test('readSource uses a fallback when the vendor blocks the primary request', async () => {
  let fallbackHeaders;
  const responses = new Map([
    ['https://vendor.example/requirements', { ok: false, status: 403, body: 'Access denied', type: 'text/html' }],
    ['https://reader.example/requirements', {
      ok: true,
      status: 200,
      body: '# Product System Requirements\nMemory\nMinimum: 8 GB\nRecommended: 16 GB\nStorage\n20 GB available space\nEnd',
      type: 'text/plain'
    }]
  ]);
  const fetchImpl = async (url, options) => {
    const response = responses.get(url);
    if (url.includes('reader.example')) fallbackHeaders = options.headers;
    return {
      ok: response.ok,
      status: response.status,
      headers: { get: () => response.type },
      text: async () => response.body
    };
  };

  const result = await readSource({
    url: 'https://vendor.example/requirements',
    render: 'fetch',
    fallbackUrls: [{
      url: 'https://reader.example/requirements',
      headers: { 'User-Agent': 'fallback-reader', Accept: 'text/plain' }
    }],
    start: 'Product System Requirements',
    end: '\\nEnd$',
    minChars: 20
  }, { fetchImpl });

  assert.equal(result.usedFallback, true);
  assert.match(result.text, /Recommended: 16 GB/);
  assert.equal(fallbackHeaders['User-Agent'], 'fallback-reader');
  assert.equal(fallbackHeaders.Accept, 'text/plain');
});

test('readSource reports every failed attempt', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 403,
    headers: { get: () => 'text/html' },
    text: async () => 'Access denied'
  });

  await assert.rejects(
    readSource({
      url: 'https://vendor.example/requirements',
      render: 'fetch',
      fallbackUrls: ['https://reader.example/requirements'],
      start: 'Requirements'
    }, { fetchImpl }),
    error => /after 2 attempts/.test(error.message) && /vendor\.example/.test(error.message) && /reader\.example/.test(error.message)
  );
});

test('Revit is opt-in and its monitored section matches the Autodesk page format', async () => {
  const requirements = JSON.parse(await readFile(new URL('../data/requirements.json', import.meta.url), 'utf8'));
  const sources = JSON.parse(await readFile(new URL('../data/sources.json', import.meta.url), 'utf8'));
  const revit = requirements.software.revit;
  const source = sources.sources.find(item => item.software === 'revit');

  assert.equal(revit.optional, true);
  assert.match(revit.optionalNote, /lab PCs/i);
  assert.ok(source);
  assert.match(section(
    'Navigation\nRevit 2026 Minimum: Entry-Level Configuration\nMemory | 16-GB RAM\nRevit Cloud Worksharing\nMore content',
    source
  ), /16-GB RAM/);
});

test('the requirements page script parses and its offline data includes Revit', async () => {
  const html = await readFile(new URL('../computer-requirements.html', import.meta.url), 'utf8');
  const executable = html.match(/<script>\s*(\(function\(\)\{[\s\S]*?)<\/script>\s*<\/body>/);
  const fallback = html.match(/<script type="application\/json" id="fallback-data">([\s\S]*?)<\/script>/);

  assert.ok(executable, 'main page script not found');
  assert.ok(fallback, 'offline requirements data not found');
  new vm.Script(executable[1]);
  assert.equal(JSON.parse(fallback[1]).requirements.software.revit.optional, true);
});

test('EGR 110 and EGR 215 list Revit as optional, not required', async () => {
  const courses = JSON.parse(await readFile(new URL('../data/courses.json', import.meta.url), 'utf8')).courses;
  for (const id of ['egr110', 'egr215']) {
    const course = courses.find(item => item.id === id);
    assert.ok(course);
    assert.ok(!course.software.includes('revit'));
    assert.deepEqual(course.optionalSoftware, ['revit']);
  }
});
