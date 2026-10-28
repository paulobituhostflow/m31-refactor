import { useState } from 'react';

const VERSICULOS = [
  { texto: 'Não fui eu que lhe ordenei? Seja forte e corajoso! Não se apavore, nem desanime, pois o Senhor, o seu Deus, estará com você por onde você andar.', referencia: 'Josué 1:9' },
  { texto: 'Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.', referencia: '1 Pedro 5:7' },
  { texto: 'O Senhor é bom, uma fortaleza no dia da angústia, e conhece os que confiam nele.', referencia: 'Naum 1:7' },
  { texto: 'O meu Deus, segundo as suas riquezas, suprirá todas as vossas necessidades em glória, por Cristo Jesus.', referencia: 'Filipenses 4:19' },
  { texto: 'Porque a sua ira dura só um momento; no seu favor está a vida. O choro pode durar uma noite, mas a alegria vem pela manhã.', referencia: 'Salmos 30:5' },
  { texto: 'Mas os que esperam no Senhor renovarão as suas forças; subirão com asas como águias; correrão, e não se cansarão; caminharão, e não se fatigarão.', referencia: 'Isaías 40:31' },
];

export default function VersiculoDoDia() {
  const [versiculo] = useState(() => VERSICULOS[Math.floor(Math.random() * VERSICULOS.length)]);
  return (
    <blockquote className="m31-gestao-versiculo" aria-label="Versículo do dia">
      <p>{versiculo.texto}</p>
      <cite>{versiculo.referencia}</cite>
    </blockquote>
  );
}
