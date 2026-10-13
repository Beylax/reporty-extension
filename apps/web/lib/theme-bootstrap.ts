// Runs before the page content is rendered, including login and guest pages.
export const themeBootstrap = `(()=>{
  const key="reporty-theme",media=matchMedia("(prefers-color-scheme: dark)");
  const preference=value=>value==="light"||value==="dark"?value:null;
  let saved=null;
  try{saved=preference(localStorage.getItem(key))}catch{}
  const apply=()=>{
    const dark=saved?saved==="dark":media.matches;
    document.documentElement.classList.toggle("dark",dark);
    document.documentElement.style.colorScheme=dark?"dark":"light";
    window.dispatchEvent(new Event("reporty-theme"));
  };
  window.addEventListener("reporty-theme-choice",event=>{
    const theme=preference(event.detail);
    if(!theme)return;
    saved=theme;
    try{localStorage.setItem(key,theme)}catch{}
    apply();
  });
  window.addEventListener("storage",event=>{
    if(event.key!==key&&event.key!==null)return;
    saved=preference(event.newValue);
    apply();
  });
  media.addEventListener("change",()=>{if(!saved)apply()});
  apply();
})();`;
