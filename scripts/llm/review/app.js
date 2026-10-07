{
  const packet = JSON.parse(document.getElementById('packet').textContent);
  const translations = JSON.parse(document.getElementById('translations').textContent);
  const el = id => document.getElementById(id);
  const korean = text => Object.hasOwn(translations, text) ? translations[text] : text;
  const labels = { pending: '미판정', correct: '맞음', wrong: '틀림', uncertain: '판단 보류' };
  const scopeNames = { overview:'챔피언 개요',statsAll:'전체 능력치',stats:'특정 능력치',skills:'전체 스킬',combo:'콤보',counterplay:'상대하는 법',advice:'내 챔피언 운영',ability:'특정 스킬',chat:'일상 대화',identity:'정체·역할',other:'기타' };
  const storageKey = `cooldown-review:${packet.packetHash}`;
  let decisions = {}, selected = packet.cases[0]?.id;
  const say = text => { el('status').textContent = text; };
  function original(details, text) {
    details.hidden = korean(text) === text;
    details.open = false;
    const body = details.querySelector('p, pre');
    body.textContent = text;
    body.lang = /\p{Script=Han}/u.test(text) ? 'zh-CN' : 'en';
  }
  function richText(body, text) {
    for (const part of text.split(/(\*\*[^*]+\*\*)/g)) {
      if (part.startsWith('**') && part.endsWith('**')) {
        const strong = document.createElement('strong'); strong.textContent = part.slice(2,-2); body.append(strong);
      } else body.append(document.createTextNode(part));
    }
  }
  function renderAnswers(row) {
    el('answers').replaceChildren();
    const distinct = row.current.filter((entry,index,all) => all.findIndex(other => other.text === entry.text) === index);
    el('answers').className = distinct.length > 1 ? 'two' : '';
    for (const answer of distinct) {
      const block = document.createElement('div'), title = document.createElement('h3'), body = document.createElement('div');
      const modeNames = { none:'모델 미사용',offline:'오프라인' };
      title.textContent = row.current.filter(other => other.text === answer.text).map(other => modeNames[other.mode] ?? other.mode).join(' / ');
      body.className = 'answer';
      richText(body, korean(answer.text) || '답변이 비어 있습니다.');
      block.append(title);
      if (korean(answer.text) !== answer.text) {
        const caption = document.createElement('p'); caption.textContent = '한국어 번역 · 원문 내용 유지'; block.append(caption);
      }
      block.append(body);
      if (korean(answer.text) !== answer.text) {
        const details = document.createElement('details'), summary = document.createElement('summary'), source = document.createElement('pre');
        summary.textContent = '답변 원문 보기'; details.append(summary,source); original(details, answer.text); block.append(details);
      }
      el('answers').append(block);
    }
  }
  function validate(value) {
    if (value.schema !== 1 || value.packetHash !== packet.packetHash || !Array.isArray(value.decisions)) throw Error('이 검수 자료와 다른 결과입니다.');
    const result = {};
    for (const decision of value.decisions) {
      const row = packet.cases.find(row => row.id === decision.id);
      if (!row || row.inputHash !== decision.inputHash || !Object.hasOwn(labels, decision.verdict)
        || typeof decision.note !== 'string' || !['', ...packet.scopes].includes(decision.scope) || result[decision.id]) throw Error('판정 항목이 올바르지 않습니다.');
      result[row.id] = { verdict:decision.verdict,scope:decision.scope,note:decision.note };
    }
    return result;
  }
  function exported() {
    return { schema:1,packetHash:packet.packetHash,patch:packet.patch,baselineHash:packet.baselineHash,selected,
      decisions:packet.cases.map(row => ({ id:row.id,inputHash:row.inputHash,question:row.question,kind:row.kind,
        ...{verdict:'pending',scope:'',note:''},...decisions[row.id] })) };
  }
  try { const saved = localStorage.getItem(storageKey); if (saved) {
    const value = JSON.parse(saved); decisions = validate(value);
    if (packet.cases.some(row => row.id === value.selected)) selected = value.selected;
  } }
  catch { say('이 브라우저의 저장된 판정을 읽지 못했습니다. 다운로드한 JSON을 불러올 수 있습니다.'); }
  function save() {
    const row = packet.cases.find(row => row.id === selected);
    if (!row) return;
    decisions[selected] = { verdict:document.querySelector('input[name=verdict]:checked')?.value ?? 'pending',scope:el('scope').value,note:el('note').value };
    try { localStorage.setItem(storageKey, JSON.stringify(exported())); say('이 브라우저에 저장했습니다. 다른 기기에서는 JSON을 불러오세요.'); }
    catch { say('브라우저 저장이 막혔습니다. 판정 결과를 복사하거나 다운로드해주세요.'); }
    queue();
  }
  function visible() {
    return packet.cases.filter(row => (el('kind').value === 'all' || row.kind === el('kind').value)
      && (el('filter').value === 'all' || (decisions[row.id]?.verdict ?? 'pending') === el('filter').value)
      && `${row.question}\n${korean(row.question)}`.toLowerCase().includes(el('search').value.toLowerCase()));
  }
  function queue() {
    el('queue').replaceChildren();
    const rows = visible();
    if (!rows.length) el('queue').textContent = '이 조건의 질문이 없습니다. 종류·상태·검색어를 바꿔주세요.';
    for (const [index,row] of rows.entries()) {
      const button = document.createElement('button');
      button.textContent = `${index+1}. ${korean(row.question)} · ${labels[decisions[row.id]?.verdict ?? 'pending']}`;
      button.setAttribute('aria-current', String(row.id === selected));
      button.onclick = () => { selected = row.id; render(); };
      el('queue').append(button);
    }
    const done = Object.values(decisions).filter(row => row.verdict !== 'pending').length;
    const scopes = packet.cases.filter(row => row.kind === 'scope').length;
    const measurements = packet.cases.reduce((n,row) => n+row.measurements.length,0);
    el('summary').textContent = `${packet.patch} · ${done}/${packet.cases.length}개 판정 · 분류 ${scopes}개 / 상성 ${packet.cases.length-scopes}개 (기존 측정 ${measurements}건)`;
    const index = rows.findIndex(row => row.id === selected);
    el('previous').disabled = index <= 0; el('next').disabled = !rows.length || index >= rows.length-1;
  }
  function render() {
    queue(); const row = packet.cases.find(row => row.id === selected);
    document.querySelector('main').hidden = !row;
    if (!row) return;
    el('question').textContent = korean(row.question);
    original(el('question-original'), row.question);
    el('position').textContent = `${row.kind === 'scope' ? '2번 · 의도 분류' : '3번 · 상성 답변'} · ${packet.cases.indexOf(row)+1}/${packet.cases.length}`;
    el('guidance').textContent = row.kind === 'scope' ? '분류기 실패가 곧 잘못된 답변은 아닙니다. 현재 답변이 의도를 충족하는지 판정하고, 필요한 답변 범위를 고르세요.' : '현재 패치의 상성 설명·조건·아이템 조언을 확인해주세요. 기존 기대값은 이전 패치 자료입니다.';
    el('historical').textContent = row.kind === 'scope' ? `기존 기대 분류: ${scopeNames[row.expected.scope]} / 실제 분류: ${scopeNames[row.measurements[0].text]}` : `기존 ${row.measurements.length}회 측정, 모델 미사용/오프라인. 의미 정답은 미확정.`;
    renderAnswers(row);
    const evidence = row.current.map(row => row.evidence).find(Boolean) || '이 질문에 첨부한 스킬 근거가 없습니다. 원본 자료를 확인해주세요.';
    el('evidence').textContent = korean(evidence);
    el('evidence-language').hidden = korean(evidence) === evidence;
    original(el('evidence-original'), evidence);
    el('expected-korean').textContent = row.kind === 'scope' ? `기존 기대 답변 범위: ${scopeNames[row.expected.scope]}` : '상성 설명의 의미 정답은 아직 확정하지 않았습니다.';
    el('expected').textContent = JSON.stringify(row.expected,null,2); el('sources').textContent = row.sources.map(source => `${source.file} · ${source.row}`).join('\n');
    const decision = decisions[row.id] ?? {verdict:'pending',scope:'',note:''};
    document.querySelector(`input[name=verdict][value=${decision.verdict}]`).checked = true;
    el('scope-label').hidden = row.kind !== 'scope'; el('scope').value = decision.scope; el('note').value = decision.note;
  }
  el('scope').append(new Option('미선택',''), ...packet.scopes.map(scope => new Option(scopeNames[scope],scope)));
  ['kind','filter','search'].forEach(id => el(id).addEventListener('input', () => { selected = visible()[0]?.id; render(); }));
  el('decision').addEventListener('input',save); el('decision').addEventListener('submit',event => event.preventDefault());
  ['previous','next'].forEach(id => el(id).onclick = () => { const rows = visible(), index = rows.findIndex(row => row.id === selected); selected = rows[index+(id === 'next' ? 1 : -1)]?.id ?? selected; render(); el('question').focus(); });
  el('copy').onclick = async () => {
    const text = JSON.stringify(exported(),null,2); el('export').hidden = false; el('output').value = text;
    try { await navigator.clipboard.writeText(text); say('판정 JSON을 복사했습니다. 채팅에 붙여넣어주세요.'); }
    catch { el('output').focus(); el('output').select(); say('자동 복사가 막혔습니다. 선택된 JSON을 직접 복사해주세요.'); }
  };
  el('download').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported(),null,2)],{type:'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = `cooldown-review-${packet.patch}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); say('판정 JSON을 다운로드했습니다.');
  };
  el('import').onchange = async () => {
    try { const file = el('import').files[0]; if (!file) return; say('판정 파일을 읽는 중입니다.');
      const value = JSON.parse(await file.text()); decisions = validate(value);
      if (packet.cases.some(row => row.id === value.selected)) selected = value.selected;
      render();
      try { localStorage.setItem(storageKey,JSON.stringify(exported())); say('판정을 불러왔습니다.'); }
      catch { say('판정을 불러왔지만 브라우저 저장이 막혔습니다. 복사하거나 다운로드해주세요.'); }
    }
    catch(error) { say(`불러오기 실패: ${error.message}`); }
    finally { el('import').value = ''; }
  };
  render();
}
