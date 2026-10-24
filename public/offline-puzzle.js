'use strict';
window.usOfflinePuzzle = async function(container) {
  const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
  const details=el('details');details.append(el('summary','Want to see what stuck? Play the saved mini crossword'));
  container.append(details);
  try {
    const response=await fetch('/demo-puzzle.json');if(!response.ok)throw Error();const puzzle=await response.json();
    if(!Array.isArray(puzzle.grid)||!Array.isArray(puzzle.entries)||puzzle.grid.length>15)throw Error();
    details.append(el('p','Archived practice puzzle. Optional, with no streak or penalty. Spaces are omitted in answers.'));
    const wrapper=el('div');wrapper.className='crossword-scroll';const grid=el('div');grid.className='crossword-grid';grid.style.gridTemplateColumns=`repeat(${puzzle.grid[0].length},32px)`;wrapper.append(grid);details.append(wrapper);
    const inputs=[];
    puzzle.grid.forEach((row,r)=>row.forEach((letter,c)=>{
      const cell=el('label');cell.className=letter?'crossword-cell':'crossword-block';grid.append(cell);if(!letter)return;
      const start=puzzle.entries.find((e)=>e.row===r&&e.col===c);if(start)cell.append(el('span',String(start.number)));
      const input=el('input');input.maxLength=1;input.autocomplete='off';input.autocapitalize='characters';input.spellcheck=false;input.setAttribute('aria-label',`Row ${r+1}, column ${c+1}`);input.oninput=()=>{input.value=input.value.toUpperCase().replace(/[^A-Z]/g,'').slice(-1);input.removeAttribute('aria-invalid');};cell.append(input);inputs.push({input,letter});
    }));
    for(const direction of ['across','down']) {details.append(el('h3',direction==='across'?'Across':'Down'));for(const e of puzzle.entries.filter((e)=>e.direction===direction)) details.append(el('p',`${e.number}. ${e.clue} (${e.answer.length})`));}
    const check=el('button','Check answers'),status=el('p');status.setAttribute('role','status');check.onclick=()=>{let correct=true;for(const {input,letter}of inputs){const match=input.value===letter;correct=correct&&match;input.setAttribute('aria-invalid',String(!match));}status.textContent=correct?'You got it. Practice complete. That’s the end—enjoy your day.':'Some letters are missing or need another look. You can also leave it here.';if(correct){check.disabled=true;inputs.forEach(({input})=>input.disabled=true);}};details.append(check,status);
  } catch {details.append(el('p','The saved puzzle is unavailable. Your reading is complete.'));}
};
