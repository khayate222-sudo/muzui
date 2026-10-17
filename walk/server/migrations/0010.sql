-- Keep an import history independent of posts: deleting a post must not make
-- the next library update re-create it. The original seed marker covered these
-- sixteen entries, including entries an operator has since removed.
CREATE TABLE curated_video_seeds (bvid TEXT PRIMARY KEY);
INSERT INTO curated_video_seeds (bvid)
SELECT column1 FROM (VALUES
 ('BV1gtTF6zEfc'),('BV15ftU6NEya'),('BV187MR6ZEYH'),('BV1aWG96zE89'),
 ('BV1L6tJ6REQw'),('BV1GnVA6YEw7'),('BV1NfMj6jEG4'),('BV1JnEk6eEUB'),
 ('BV1kM9hBdE2U'),('BV1xNokBuE9z'),('BV1CF5F6VEHQ'),('BV1RfhA6EEYZ'),
 ('BV1B7Lk6RER6'),('BV1Cx3x66EEM'),('BV1oVJH6rErk'),('BV1Pdtw6DEsR')
) WHERE EXISTS (SELECT 1 FROM seed_state WHERE id=4);
