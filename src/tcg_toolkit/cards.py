"""Private, manually maintained card inventory."""
import sqlite3
import time
import uuid
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from .auth.routes import current_user, write_guard

router = APIRouter(prefix='/api/cards')
GAMES = {'ws': 'WS', 'wsr': 'WSR', 'pm': 'PM', 'sev': 'SEV', 'lycee': 'Lycee',
         'chaos': 'ChaosTCG', 'chaostcg': 'ChaosTCG'}


class CardInput(BaseModel):
    game: str = Field(min_length=1)
    card_number: str = Field(min_length=1)
    rarity: str = Field(min_length=1)
    name: str = Field(min_length=1)
    quantity: int = Field(default=1, strict=True, ge=0, le=9007199254740991)
    notes: str = ''
    image_url: str = ''

    @field_validator('image_url', mode='before')
    @classmethod
    def image_location(cls, value):
        if value is None:
            return ''
        if not isinstance(value, str):
            raise ValueError('Invalid image URL')
        value = value.strip()
        if value:
            url = urlsplit(value)
            if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
                raise ValueError('Image URL must be HTTP or HTTPS')
        return value


    @field_validator('game', 'card_number', 'rarity', 'name', 'notes')
    @classmethod
    def clean(cls, value, info):
        value = value.strip()
        if info.field_name != 'notes' and not value:
            raise ValueError('Must not be blank')
        return GAMES.get(value.casefold(), value) if info.field_name == 'game' else value


def record(row):
    return {key: row[key] for key in ('id', 'game', 'card_number', 'rarity', 'name',
                                    'quantity', 'notes', 'image_url', 'created_at', 'updated_at')}


def owned(db, user_id, card_id):
    row = db.execute('SELECT * FROM owned_cards WHERE user_id = ? AND id = ?',
                     (user_id, card_id)).fetchone()
    if row is None:
        raise HTTPException(404, detail='card_not_found')
    return row


def values(body):
    return (body.game, body.card_number, body.rarity, body.name, body.quantity,
            body.notes, body.game.casefold(), body.card_number.casefold(), body.rarity.casefold())


def conflict(db, user_id, body):
    row = db.execute('''SELECT id FROM owned_cards WHERE user_id = ?
        AND game_key = ? AND number_key = ? AND rarity_key = ?''',
        (user_id, body.game.casefold(), body.card_number.casefold(), body.rarity.casefold())).fetchone()
    if row:
        raise HTTPException(409, detail={'type': 'card_duplicate', 'id': row['id']})


@router.get('')
def listing(request: Request, user=Depends(current_user)):
    with request.app.state.auth.store.connect() as db:
        return {'items': [record(row) for row in db.execute(
            'SELECT * FROM owned_cards WHERE user_id = ? ORDER BY created_at DESC, rowid DESC', (user['id'],))]}


@router.post('', status_code=201, dependencies=[Depends(write_guard)])
def add(body: CardInput, request: Request, user=Depends(current_user)):
    card_id, now = str(uuid.uuid4()), int(time.time())
    with request.app.state.auth.store.connect() as db:
        try:
            db.execute('INSERT INTO owned_cards VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                       (card_id, user['id'], *values(body), now, now, body.image_url))
        except sqlite3.IntegrityError:
            conflict(db, user['id'], body)
            raise
        return record(owned(db, user['id'], card_id))


@router.put('/{card_id}', dependencies=[Depends(write_guard)])
def update(card_id: str, body: CardInput, request: Request, user=Depends(current_user)):
    with request.app.state.auth.store.connect() as db:
        owned(db, user['id'], card_id)
        try:
            db.execute('''UPDATE owned_cards SET game=?, card_number=?, rarity=?, name=?, quantity=?,
                notes=?, game_key=?, number_key=?, rarity_key=?, image_url=?, updated_at=? WHERE user_id=? AND id=?''',
                (*values(body), body.image_url, int(time.time()), user['id'], card_id))
        except sqlite3.IntegrityError:
            conflict(db, user['id'], body)
            raise
        return record(owned(db, user['id'], card_id))


@router.delete('/{card_id}', status_code=204, dependencies=[Depends(write_guard)])
def remove(card_id: str, request: Request, user=Depends(current_user)):
    with request.app.state.auth.store.connect() as db:
        owned(db, user['id'], card_id)
        db.execute('DELETE FROM owned_cards WHERE user_id = ? AND id = ?', (user['id'], card_id))
