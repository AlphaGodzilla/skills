/** UTF-16 offsets stay exact; normal UI blocks keep complete surrogate pairs at their boundaries. */
export function textBlockEnd(text,offset,limit) {
  let end=Math.min(text.length,offset+limit);
  if(end-offset>1&&end<text.length&&text.charCodeAt(end-1)>=0xD800&&text.charCodeAt(end-1)<=0xDBFF&&
    text.charCodeAt(end)>=0xDC00&&text.charCodeAt(end)<=0xDFFF)end--;
  return end;
}
