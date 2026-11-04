-- REVIEW ONLY. Reverts 0009 bucket exposure; restore the two functions from 0004/site migrations if needed.
update storage.buckets set public = false where id = 'player-photos';
