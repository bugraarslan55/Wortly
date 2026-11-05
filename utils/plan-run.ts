// Plan oturumu açıkken (app/plan.tsx) sonuç ekranının "Plana dön" akışını göstermesi için bellek içi bayrak.
// Plan ekranı kapanınca temizlenir; böylece yarım bırakılan bir plan sonraki bağımsız sonuçları etkilemez.
let active = false;

export const setPlanRunActive = (value: boolean) => { active = value; };
export const isPlanRunActive = () => active;
