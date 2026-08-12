update public.sources set enabled=true, updated_at=now() where code='mock';
insert into public.clubs(canonical_name,normalized_name,region) values ('스핀탁구클럽','스핀탁구클럽','서울'),('블루라켓','블루라켓','부산'),('드라이브탁구회','드라이브탁구회','경기');
insert into public.players(canonical_name,normalized_name,primary_club_id,primary_region,identity_status) values ('김탁구','김탁구',1,'서울','likely'),('김탁구','김탁구',2,'부산','unreviewed'),('이라켓','이라켓',3,'경기','verified');
