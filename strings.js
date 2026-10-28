/* Spade Contract — translation tables (see i18n.js).
 * Each row: [English key, es-419, de-DE, fr-FR, pt-BR, it-IT]. en-GB, es-ES and
 * fr-CA list only where they differ from en-US, es-419 and fr-FR.
 * "Spade Contract" and "StarHermit" are names and stay as they are; card ranks
 * (2–10, J, Q, K, A) and suit glyphs are shown as-is. The Graphics strings live
 * in gfx-panel.js, the StarHermit account strings in sh-strings.js.
 */
(function (root) {
  'use strict';
  var ROWS = [
    // ---- static markup
    ['Menu actions', 'Acciones del menú', 'Menüaktionen', 'Actions du menu', 'Ações do menu', 'Azioni del menu'],
    ['Score summary', 'Resumen de puntuación', 'Punkteübersicht', 'Résumé des scores', 'Resumo do placar', 'Riepilogo punteggi'],
    ['Card table', 'Mesa de cartas', 'Kartentisch', 'Table de jeu', 'Mesa de cartas', 'Tavolo da gioco'],
    ['Tricks taken this round', 'Bazas ganadas en esta ronda', 'Stiche in dieser Runde', 'Plis remportés cette manche', 'Vazas feitas nesta rodada', 'Prese in questo round'],
    ['Help', 'Ayuda', 'Hilfe', 'Aide', 'Ajuda', 'Aiuto'],
    ['Settings', 'Ajustes', 'Einstellungen', 'Paramètres', 'Configurações', 'Impostazioni'],
    ['New Game', 'Nueva partida', 'Neues Spiel', 'Nouvelle partie', 'Novo jogo', 'Nuova partita'],
    ['Team A (South / North)', 'Equipo A (Sur / Norte)', 'Team A (Süd / Nord)', 'Équipe A (Sud / Nord)', 'Time A (Sul / Norte)', 'Squadra A (Sud / Nord)'],
    ['Team B (West / East)', 'Equipo B (Oeste / Este)', 'Team B (West / Ost)', 'Équipe B (Ouest / Est)', 'Time B (Oeste / Leste)', 'Squadra B (Ovest / Est)'],
    ['Results', 'Resultados', 'Ergebnisse', 'Résultats', 'Resultados', 'Risultati'],
    ['Pass (0)', 'Paso (0)', 'Passen (0)', 'Passe (0)', 'Passo (0)', 'Passo (0)'],
    ['Bid 1', 'Apostar 1', '1 bieten', 'Annoncer 1', 'Apostar 1', 'Dichiara 1'],
    ['Bid 2', 'Apostar 2', '2 bieten', 'Annoncer 2', 'Apostar 2', 'Dichiara 2'],
    ['Bid 3', 'Apostar 3', '3 bieten', 'Annoncer 3', 'Apostar 3', 'Dichiara 3'],
    // ---- cards, seats
    ['Spades', 'picas', 'Pik', 'pique', 'espadas', 'picche'],
    ['Hearts', 'corazones', 'Herz', 'cœur', 'copas', 'cuori'],
    ['Diamonds', 'diamantes', 'Karo', 'carreau', 'ouros', 'quadri'],
    ['Clubs', 'tréboles', 'Kreuz', 'trèfle', 'paus', 'fiori'],
    ['South (You)', 'Sur (tú)', 'Süd (du)', 'Sud (vous)', 'Sul (você)', 'Sud (tu)'],
    ['West', 'Oeste', 'West', 'Ouest', 'Oeste', 'Ovest'],
    ['North (Partner)', 'Norte (compañero)', 'Nord (Partner)', 'Nord (partenaire)', 'Norte (parceiro)', 'Nord (compagno)'],
    ['East', 'Este', 'Ost', 'Est', 'Leste', 'Est'],
    ['South', 'Sur', 'Süd', 'Sud', 'Sul', 'Sud'],
    ['North', 'Norte', 'Nord', 'Nord', 'Norte', 'Nord'],
    ['{rank} of {suit}', '{rank} de {suit}', '{suit} {rank}', '{rank} de {suit}', '{rank} de {suit}', '{rank} di {suit}'],
    ['Round {n} / {total}', 'Ronda {n} / {total}', 'Runde {n} / {total}', 'Manche {n} / {total}', 'Rodada {n} / {total}', 'Round {n} / {total}'],
    ['bidding', 'apostando', 'bietet', 'annonce', 'apostando', 'dichiara'],
    ['{n} cards', '{n} cartas', '{n} Karten', '{n} cartes', '{n} cartas', '{n} carte'],
    ['{card}, not playable, must follow {suit}', '{card}, no se puede jugar, hay que seguir {suit}', '{card}, nicht spielbar, {suit} muss bedient werden', '{card}, injouable, il faut fournir à {suit}', '{card}, não jogável, é preciso seguir {suit}', '{card}, non giocabile, bisogna rispondere a {suit}'],
    ['{seat}: {n}', '{seat}: {n}', '{seat}: {n}', '{seat} : {n}', '{seat}: {n}', '{seat}: {n}'],
    // ---- phases and status
    ['Welcome', 'Bienvenida', 'Willkommen', 'Bienvenue', 'Boas-vindas', 'Benvenuto'],
    ['Press New Game to start a match.', 'Pulsa Nueva partida para empezar.', 'Drück auf „Neues Spiel“, um eine Partie zu beginnen.', 'Appuyez sur Nouvelle partie pour commencer.', 'Toque em Novo jogo para começar uma partida.', 'Premi Nuova partita per iniziare.'],
    ['Bid', 'Apuesta', 'Gebot', 'Annonce', 'Aposta', 'Dichiarazione'],
    ['Your bid: how many tricks will you take? ({bids})', 'Tu apuesta: ¿cuántas bazas ganarás? ({bids})', 'Dein Gebot: Wie viele Stiche machst du? ({bids})', 'Votre annonce : combien de plis ferez-vous ? ({bids})', 'Sua aposta: quantas vazas você vai fazer? ({bids})', 'La tua dichiarazione: quante prese farai? ({bids})'],
    ['{seat} is bidding… ({bids})', '{seat} está apostando… ({bids})', '{seat} bietet … ({bids})', '{seat} annonce… ({bids})', '{seat} está apostando… ({bids})', '{seat} sta dichiarando… ({bids})'],
    ['Play', 'Juego', 'Spiel', 'Jeu', 'Jogo', 'Gioco'],
    ['Your turn — play a highlighted card. Contracts: A {a}, B {b}.', 'Tu turno: juega una carta resaltada. Contratos: A {a}, B {b}.', 'Du bist dran – spiel eine hervorgehobene Karte. Kontrakte: A {a}, B {b}.', 'À vous — jouez une carte en surbrillance. Contrats : A {a}, B {b}.', 'Sua vez — jogue uma carta destacada. Contratos: A {a}, B {b}.', 'Tocca a te: gioca una carta evidenziata. Contratti: A {a}, B {b}.'],
    ['{seat} is playing… Contracts: A {a}, B {b}.', '{seat} está jugando… Contratos: A {a}, B {b}.', '{seat} spielt … Kontrakte: A {a}, B {b}.', '{seat} joue… Contrats : A {a}, B {b}.', '{seat} está jogando… Contratos: A {a}, B {b}.', '{seat} sta giocando… Contratti: A {a}, B {b}.'],
    ['Round {n} scored', 'Ronda {n} puntuada', 'Runde {n} gewertet', 'Manche {n} comptée', 'Rodada {n} pontuada', 'Round {n} conteggiato'],
    ['{seat} wins the trick.', '{seat} gana la baza.', '{seat} gewinnt den Stich.', '{seat} remporte le pli.', '{seat} faz a vaza.', '{seat} vince la presa.'],
    ['Final — Team A: {a} · Team B: {b}', 'Final: Equipo A: {a} · Equipo B: {b}', 'Endstand – Team A: {a} · Team B: {b}', 'Final — Équipe A : {a} · Équipe B : {b}', 'Final — Time A: {a} · Time B: {b}', 'Finale: Squadra A: {a} · Squadra B: {b}'],
    ['The match is a tie.', 'La partida termina en empate.', 'Die Partie endet unentschieden.', 'La partie se termine à égalité.', 'A partida terminou empatada.', 'La partita finisce in parità.'],
    ['Team A (your team) wins the contract!', '¡El equipo A (tu equipo) gana el contrato!', 'Team A (dein Team) gewinnt den Kontrakt!', 'L’équipe A (votre équipe) remporte le contrat !', 'O time A (seu time) vence o contrato!', 'La squadra A (la tua) vince il contratto!'],
    ['Team B wins the contract.', 'El equipo B gana el contrato.', 'Team B gewinnt den Kontrakt.', 'L’équipe B remporte le contrat.', 'O time B vence o contrato.', 'La squadra B vince il contratto.'],
    ['A: bid {bidA}, took {tookA} ({deltaA}) · B: bid {bidB}, took {tookB} ({deltaB})', 'A: apostó {bidA}, ganó {tookA} ({deltaA}) · B: apostó {bidB}, ganó {tookB} ({deltaB})', 'A: geboten {bidA}, gemacht {tookA} ({deltaA}) · B: geboten {bidB}, gemacht {tookB} ({deltaB})', 'A : annonce {bidA}, plis {tookA} ({deltaA}) · B : annonce {bidB}, plis {tookB} ({deltaB})', 'A: apostou {bidA}, fez {tookA} ({deltaA}) · B: apostou {bidB}, fez {tookB} ({deltaB})', 'A: dichiarate {bidA}, prese {tookA} ({deltaA}) · B: dichiarate {bidB}, prese {tookB} ({deltaB})'],
    ['You must follow {suit} if you can.', 'Debes seguir {suit} si puedes.', 'Du musst {suit} bedienen, wenn du kannst.', 'Vous devez fournir à {suit} si vous le pouvez.', 'Você precisa seguir {suit} se puder.', 'Devi rispondere a {suit} se puoi.'],
    // ---- dialogs
    ['Close', 'Cerrar', 'Schließen', 'Fermer', 'Fechar', 'Chiudi'],
    ['Goal:', 'Objetivo:', 'Ziel:', 'Objectif :', 'Objetivo:', 'Obiettivo:'],
    ['across five rounds, your team (South and North) bids how many tricks it will take, then tries to make that contract.', 'durante cinco rondas, tu equipo (Sur y Norte) apuesta cuántas bazas ganará y luego intenta cumplir ese contrato.', 'In fünf Runden bietet dein Team (Süd und Nord), wie viele Stiche es macht, und versucht dann, diesen Kontrakt zu erfüllen.', 'en cinq manches, votre équipe (Sud et Nord) annonce combien de plis elle fera, puis tente de remplir ce contrat.', 'em cinco rodadas, seu time (Sul e Norte) aposta quantas vazas vai fazer e depois tenta cumprir esse contrato.', 'in cinque round la tua squadra (Sud e Nord) dichiara quante prese farà, poi cerca di rispettare il contratto.'],
    ['Each player bids 0–3 tricks. Your team\'s contract is the sum of its bids.', 'Cada jugador apuesta de 0 a 3 bazas. El contrato de tu equipo es la suma de sus apuestas.', 'Jede Person bietet 0–3 Stiche. Der Kontrakt deines Teams ist die Summe seiner Gebote.', 'Chaque joueur annonce de 0 à 3 plis. Le contrat de votre équipe est la somme de ses annonces.', 'Cada jogador aposta de 0 a 3 vazas. O contrato do seu time é a soma das apostas.', 'Ogni giocatore dichiara da 0 a 3 prese. Il contratto della tua squadra è la somma delle dichiarazioni.'],
    ['South leads the first trick; afterwards the winner of a trick leads the next one.', 'Sur sale en la primera baza; después, quien gana una baza sale en la siguiente.', 'Süd spielt zum ersten Stich aus; danach spielt jeweils der Gewinner des Stichs aus.', 'Sud entame le premier pli ; ensuite, le gagnant d’un pli entame le suivant.', 'Sul abre a primeira vaza; depois, quem vence uma vaza abre a seguinte.', 'Sud apre la prima presa; poi chi vince una presa apre la successiva.'],
    ['You must follow the led suit if you can.', 'Debes seguir el palo de salida si puedes.', 'Du musst die ausgespielte Farbe bedienen, wenn du kannst.', 'Vous devez fournir à la couleur demandée si vous le pouvez.', 'Você precisa seguir o naipe de saída se puder.', 'Devi rispondere al seme di uscita se puoi.'],
    ['Spades are always trump and beat every other suit.', 'Las picas siempre son triunfo y ganan a cualquier otro palo.', 'Pik ist immer Trumpf und schlägt jede andere Farbe.', 'Pique est toujours atout et bat toutes les autres couleurs.', 'Espadas são sempre trunfo e vencem qualquer outro naipe.', 'Picche è sempre briscola e batte ogni altro seme.'],
    ['Highest trump — or highest card of the led suit — wins the trick; the winner leads next.', 'El triunfo más alto (o la carta más alta del palo de salida) gana la baza; quien gana sale en la siguiente.', 'Der höchste Trumpf – oder die höchste Karte der ausgespielten Farbe – gewinnt den Stich; der Gewinner spielt als Nächstes aus.', 'L’atout le plus fort — ou la plus forte carte de la couleur demandée — remporte le pli ; le gagnant entame ensuite.', 'O trunfo mais alto — ou a carta mais alta do naipe de saída — vence a vaza; quem vence abre a próxima.', 'La briscola più alta, o la carta più alta del seme di uscita, vince la presa; chi vince apre la successiva.'],
    ['Make your contract: +10 per trick bid, +1 per extra trick. Miss it: −10 per trick bid.', 'Si cumples el contrato: +10 por baza apostada, +1 por baza extra. Si fallas: −10 por baza apostada.', 'Kontrakt erfüllt: +10 pro gebotenem Stich, +1 pro Extrastich. Verfehlt: −10 pro gebotenem Stich.', 'Contrat rempli : +10 par pli annoncé, +1 par pli supplémentaire. Contrat chuté : −10 par pli annoncé.', 'Cumpra o contrato: +10 por vaza apostada, +1 por vaza extra. Se falhar: −10 por vaza apostada.', 'Contratto rispettato: +10 per presa dichiarata, +1 per presa in più. Mancato: −10 per presa dichiarata.'],
    ['After five rounds the team with the higher score wins.', 'Tras cinco rondas gana el equipo con más puntos.', 'Nach fünf Runden gewinnt das Team mit der höheren Punktzahl.', 'Après cinq manches, l’équipe qui a le plus de points gagne.', 'Depois de cinco rodadas, vence o time com mais pontos.', 'Dopo cinque round vince la squadra con il punteggio più alto.'],
    ['How to play', 'Cómo jugar', 'So wird gespielt', 'Comment jouer', 'Como jogar', 'Come si gioca'],
    // ---- account chip
    ['synced', 'sincronizado', 'synchronisiert', 'synchronisé', 'sincronizado', 'sincronizzato'],
    ['saving…', 'guardando…', 'wird gespeichert …', 'enregistrement…', 'salvando…', 'salvataggio…'],
    ['offline', 'sin conexión', 'offline', 'hors ligne', 'offline', 'offline']
  ];

  var COLS = ['es-419', 'de-DE', 'fr-FR', 'pt-BR', 'it-IT'];
  var T = { 'en-US': {} };
  COLS.forEach(function (loc) { T[loc] = {}; });
  ROWS.forEach(function (row) { COLS.forEach(function (loc, i) { T[loc][row[0]] = row[i + 1]; }); });
  T['en-GB'] = {};
  T['es-ES'] = {
    '{seat} is bidding… ({bids})': '{seat} está pujando… ({bids})',
    'Your bid: how many tricks will you take? ({bids})': 'Tu puja: ¿cuántas bazas ganarás? ({bids})',
    'Bid': 'Puja',
    'Bid 1': 'Pujar 1',
    'Bid 2': 'Pujar 2',
    'Bid 3': 'Pujar 3',
    'bidding': 'pujando',
    'Each player bids 0–3 tricks. Your team\'s contract is the sum of its bids.': 'Cada jugador puja de 0 a 3 bazas. El contrato de tu equipo es la suma de sus pujas.',
    'across five rounds, your team (South and North) bids how many tricks it will take, then tries to make that contract.': 'durante cinco rondas, tu equipo (Sur y Norte) puja cuántas bazas ganará y luego intenta cumplir ese contrato.',
    'Make your contract: +10 per trick bid, +1 per extra trick. Miss it: −10 per trick bid.': 'Si cumples el contrato: +10 por baza pujada, +1 por baza extra. Si fallas: −10 por baza pujada.',
    'A: bid {bidA}, took {tookA} ({deltaA}) · B: bid {bidB}, took {tookB} ({deltaB})': 'A: pujó {bidA}, ganó {tookA} ({deltaA}) · B: pujó {bidB}, ganó {tookB} ({deltaB})'
  };
  T['fr-CA'] = {
    'Score summary': 'Résumé des pointages'
  };

  root.SC_STRINGS = T;
})(globalThis);
