/* Tiny Chinook-style music shop. Loaded on first boot; Sample puts it back. */
(function (root) {
  'use strict';

  var NAME = 'chinook-tiny.sqlite';

  var SQL = [
    'PRAGMA foreign_keys = ON;',
    'CREATE TABLE artists (',
    '  id INTEGER PRIMARY KEY,',
    '  name TEXT NOT NULL',
    ');',
    'CREATE TABLE albums (',
    '  id INTEGER PRIMARY KEY,',
    '  title TEXT NOT NULL,',
    '  artist_id INTEGER NOT NULL REFERENCES artists(id)',
    ');',
    'CREATE TABLE tracks (',
    '  id INTEGER PRIMARY KEY,',
    '  name TEXT NOT NULL,',
    '  album_id INTEGER NOT NULL REFERENCES albums(id),',
    '  ms INTEGER NOT NULL,',
    '  genre TEXT NOT NULL',
    ');',
    'CREATE TABLE customers (',
    '  id INTEGER PRIMARY KEY,',
    '  name TEXT NOT NULL,',
    '  city TEXT,',
    '  country TEXT NOT NULL',
    ');',
    'CREATE TABLE invoices (',
    '  id INTEGER PRIMARY KEY,',
    '  customer_id INTEGER NOT NULL REFERENCES customers(id),',
    '  date TEXT NOT NULL,',
    '  total REAL NOT NULL',
    ');',
    'CREATE TABLE invoice_lines (',
    '  id INTEGER PRIMARY KEY,',
    '  invoice_id INTEGER NOT NULL REFERENCES invoices(id),',
    '  track_id INTEGER NOT NULL REFERENCES tracks(id),',
    '  unit_price REAL NOT NULL,',
    '  qty INTEGER NOT NULL',
    ');',
    "INSERT INTO artists (id, name) VALUES",
    " (1,'Miles Davis'),(2,'John Coltrane'),(3,'Nina Simone'),",
    " (4,'Bill Evans'),(5,'Thelonious Monk'),(6,'Ella Fitzgerald'),",
    " (7,'Charles Mingus'),(8,'Cannonball Adderley');",
    "INSERT INTO albums (id, title, artist_id) VALUES",
    " (1,'Kind of Blue',1),(2,'Sketches of Spain',1),",
    " (3,'A Love Supreme',2),(4,'Blue Train',2),",
    " (5,'Little Girl Blue',3),(6,'Waltz for Debby',4),",
    " (7,'Monk''s Dream',5),(8,'Ella and Louis',6),",
    " (9,'Mingus Ah Um',7),(10,'Somethin'' Else',8);",
    "INSERT INTO tracks (id, name, album_id, ms, genre) VALUES",
    " (1,'So What',1,562000,'Jazz'),(2,'Freddie Freeloader',1,575000,'Jazz'),",
    " (3,'Blue in Green',1,337000,'Jazz'),(4,'Concierto de Aranjuez',2,978000,'Jazz'),",
    " (5,'Saeta',2,330000,'Jazz'),(6,'Acknowledgement',3,462000,'Jazz'),",
    " (7,'Resolution',3,441000,'Jazz'),(8,'Pursuance / Psalm',3,1073000,'Jazz'),",
    " (9,'Blue Train',4,642000,'Jazz'),(10,'Moment''s Notice',4,554000,'Jazz'),",
    " (11,'Mood Indigo',5,250000,'Vocal'),(12,'Little Girl Blue',5,265000,'Vocal'),",
    " (13,'Waltz for Debby',6,420000,'Jazz'),(14,'My Foolish Heart',6,295000,'Jazz'),",
    " (15,'Monk''s Dream',7,386000,'Jazz'),(16,'Body and Soul',7,277000,'Jazz'),",
    " (17,'April in Paris',8,393000,'Vocal'),(18,'The Nearness of You',8,341000,'Vocal'),",
    " (19,'Better Git It in Your Soul',9,438000,'Jazz'),(20,'Goodbye Pork Pie Hat',9,348000,'Jazz'),",
    " (21,'Autumn Leaves',10,667000,'Jazz'),(22,'Love for Sale',10,433000,'Jazz'),",
    " (23,'Somethin'' Else',10,498000,'Jazz'),(24,'One for Daddy-O',10,520000,'Jazz');",
    "INSERT INTO customers (id, name, city, country) VALUES",
    " (1,'Ada Lovelace','London','UK'),(2,'Alan Turing','Manchester','UK'),",
    " (3,'Grace Hopper','New York','USA'),(4,'Katherine Johnson','Hampton','USA'),",
    " (5,'Hedy Lamarr','Vienna','Austria'),(6,'Claude Shannon','Gaylord','USA');",
    "INSERT INTO invoices (id, customer_id, date, total) VALUES",
    " (1,1,'2024-03-12',2.97),(2,3,'2024-04-02',1.98),(3,2,'2024-05-18',3.96),",
    " (4,4,'2024-06-09',0.99),(5,6,'2024-07-21',2.97),(6,5,'2024-08-04',1.98),",
    " (7,3,'2024-09-15',4.95),(8,1,'2024-10-01',1.98);",
    "INSERT INTO invoice_lines (id, invoice_id, track_id, unit_price, qty) VALUES",
    " (1,1,1,0.99,1),(2,1,6,0.99,1),(3,1,13,0.99,1),",
    " (4,2,11,0.99,1),(5,2,17,0.99,1),",
    " (6,3,4,0.99,2),(7,3,21,0.99,2),",
    " (8,4,9,0.99,1),",
    " (9,5,3,0.99,1),(10,5,14,0.99,1),(11,5,20,0.99,1),",
    " (12,6,12,0.99,1),(13,6,18,0.99,1),",
    " (14,7,8,0.99,1),(15,7,19,0.99,2),(16,7,23,0.99,2),",
    " (17,8,2,0.99,1),(18,8,15,0.99,1);"
  ].join('\n');

  var STARTER = [
    'SELECT ar.name AS artist,',
    '       al.title AS album,',
    '       COUNT(t.id) AS tracks,',
    '       ROUND(SUM(t.ms) / 60000.0, 1) AS minutes',
    'FROM artists ar',
    'JOIN albums al ON al.artist_id = ar.id',
    'JOIN tracks t ON t.album_id = al.id',
    'GROUP BY al.id',
    'ORDER BY minutes DESC;'
  ].join('\n');

  var CHIPS = [
    { label: 'Artists', sql: 'SELECT * FROM artists;' },
    { label: 'Albums', sql: 'SELECT al.title, ar.name AS artist\nFROM albums al\nJOIN artists ar ON ar.id = al.artist_id\nORDER BY ar.name, al.title;' },
    { label: 'Longest tracks', sql: 'SELECT t.name, al.title AS album, ROUND(t.ms / 60000.0, 2) AS minutes, t.genre\nFROM tracks t\nJOIN albums al ON al.id = t.album_id\nORDER BY t.ms DESC\nLIMIT 8;' },
    { label: 'Sales by country', sql: 'SELECT c.country, COUNT(i.id) AS invoices, ROUND(SUM(i.total), 2) AS spent\nFROM customers c\nJOIN invoices i ON i.customer_id = c.id\nGROUP BY c.country\nORDER BY spent DESC;' },
    { label: 'Who bought what', sql: 'SELECT c.name AS customer, t.name AS track, il.qty, il.unit_price\nFROM invoice_lines il\nJOIN invoices i ON i.id = il.invoice_id\nJOIN customers c ON c.id = i.customer_id\nJOIN tracks t ON t.id = il.track_id\nORDER BY c.name, t.name;' }
  ];

  root.SQL_SAMPLE_NAME = NAME;
  root.SQL_SAMPLE = SQL;
  root.SQL_STARTER = STARTER;
  root.SQL_CHIPS = CHIPS;
})(typeof window !== 'undefined' ? window : this);
