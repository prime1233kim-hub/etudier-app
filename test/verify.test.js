const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyCandidate, domainFitsBrand, isPrivateAddress, phraseOnPage } = require('../server/research/verify');

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];
const privateLookup = async () => [{ address: '10.0.0.5', family: 4 }];

function fakeFetch(pages) {
  return async (url) => {
    const page = pages[url];
    if (!page) throw new Error('network error');
    if (page.redirect) return new Response(null, { status: 301, headers: { location: page.redirect } });
    return new Response(page.body || '', { status: page.status || 200, headers: { 'content-type': 'text/html' } });
  };
}

const html = (title, text) => `<html><head><title>${title}</title></head><body><script>var x="ignored brand"</script><p>${text}</p></body></html>`;

const base = {
  brand: 'Maison Margiela',
  official_domain: 'maisonmargiela.com',
  product_name: 'Tabi ankle boots',
  collection: 'Spring Summer 2024',
  match_claim: 'exact_product'
};

test('brand/domain matching', () => {
  assert.ok(domainFitsBrand('maisonmargiela.com', 'Maison Margiela'));
  assert.ok(domainFitsBrand('comme-des-garcons.com', 'Comme des Garçons'));
  assert.ok(domainFitsBrand('hermes.com', 'Hermès'));
  assert.ok(domainFitsBrand('louisvuitton.co.uk', 'Louis Vuitton'));
  assert.ok(!domainFitsBrand('ssense.com', 'Maison Margiela'));
  assert.ok(!domainFitsBrand('farfetch.com', 'Prada'));
});

test('private network addresses are rejected', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.10', '172.20.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
    assert.ok(isPrivateAddress(ip), ip);
  }
  assert.ok(!isPrivateAddress('93.184.216.34'));
});

test('phrase matching tolerates word order and accents', () => {
  assert.ok(phraseOnPage('tabi ankle boots in black leather', 'Tabi Ankle Boots'));
  assert.ok(phraseOnPage('comme des garcons homme plus', 'Comme des Garçons'));
  assert.ok(!phraseOnPage('a completely different page', 'Tabi Ankle Boots'));
});

test('verified match needs official domain + brand + product on page', async () => {
  const url = 'https://www.maisonmargiela.com/en/tabi-ankle-boots';
  const r = await verifyCandidate({ ...base, url }, {
    lookup: publicLookup,
    fetchImpl: fakeFetch({ [url]: { body: html('Tabi ankle boots | Maison Margiela', 'Spring Summer 2024 collection') } })
  });
  assert.equal(r.status, 'verified');
  assert.ok(r.checks.official_domain && r.checks.brand_on_page && r.checks.product_on_page && r.checks.collection_on_page);
});

test('official page without the product is only a related reference', async () => {
  const url = 'https://www.maisonmargiela.com/en/women';
  const r = await verifyCandidate({ ...base, url }, {
    lookup: publicLookup,
    fetchImpl: fakeFetch({ [url]: { body: html('Women | Maison Margiela', 'Ready-to-wear') } })
  });
  assert.equal(r.status, 'related');
  assert.equal(r.checks.product_on_page, false);
});

test('reseller pages stay unverified even if they name the product', async () => {
  const url = 'https://www.ssense.com/en/product/tabi';
  const r = await verifyCandidate({ ...base, url }, {
    lookup: publicLookup,
    fetchImpl: fakeFetch({ [url]: { body: html('Maison Margiela Tabi ankle boots', 'Maison Margiela') } })
  });
  assert.equal(r.status, 'unverified');
});

test('a reseller cannot pass itself off as the official domain', async () => {
  const url = 'https://www.ssense.com/en/product/tabi';
  const r = await verifyCandidate({ ...base, official_domain: 'ssense.com', url }, {
    lookup: publicLookup,
    fetchImpl: fakeFetch({ [url]: { body: html('Maison Margiela Tabi ankle boots', 'Maison Margiela') } })
  });
  assert.equal(r.status, 'unverified');
  assert.equal(r.checks.official_domain, false);
});

test('dead links, http links and private hosts are dropped', async () => {
  const dead = 'https://www.maisonmargiela.com/missing';
  assert.equal(await verifyCandidate({ ...base, url: dead }, { lookup: publicLookup, fetchImpl: fakeFetch({ [dead]: { status: 404 } }) }), null);
  assert.equal(await verifyCandidate({ ...base, url: 'http://www.maisonmargiela.com/' }, { lookup: publicLookup, fetchImpl: fakeFetch({}) }), null);
  const internal = 'https://intranet.example.com/';
  assert.equal(await verifyCandidate({ ...base, url: internal }, { lookup: privateLookup, fetchImpl: fakeFetch({ [internal]: { body: 'x' } }) }), null);
  assert.equal(await verifyCandidate({ ...base, url: 'not a url' }), null);
});

test('redirects to a private address are refused', async () => {
  const start = 'https://www.maisonmargiela.com/go';
  let call = 0;
  const lookup = async () => (call++ === 0 ? [{ address: '93.184.216.34' }] : [{ address: '127.0.0.1' }]);
  const r = await verifyCandidate({ ...base, url: start }, {
    lookup,
    fetchImpl: fakeFetch({ [start]: { redirect: 'https://evil.example/' } })
  });
  assert.equal(r, null);
});

test('Instagram links are always unverified', async () => {
  const r = await verifyCandidate({ ...base, url: 'https://www.instagram.com/p/abc123/' });
  assert.equal(r.status, 'unverified');
  assert.match(r.note, /Instagram/);
});

test('sites that block automated checks are kept but unverified', async () => {
  const url = 'https://www.maisonmargiela.com/en/blocked';
  const r = await verifyCandidate({ ...base, url }, { lookup: publicLookup, fetchImpl: fakeFetch({ [url]: { status: 403 } }) });
  assert.equal(r.status, 'unverified');
  assert.match(r.note, /blocks automated checks/);
});
