"""The three retail checklists: Open 31-41, Day 1-30, Close 42-52.

Authored once, used by the reseed migration and by tests. Spanish lives on
each check. `verify_prev` marks what the next shift has to confirm.
"""
from __future__ import annotations

from datetime import time


def _check(cid: str, label: str, label_es: str, *, verify_prev: bool = False) -> dict:
    return {
        'id': cid,
        'label': label,
        'label_es': label_es,
        'control': 'pass_fail',
        'hint': '',
        'hint_es': '',
        'unit': '',
        'critical': False,
        'verify_prev': verify_prev,
    }


def _section(sid: str, title: str, title_es: str, checks: list[dict]) -> dict:
    return {
        'id': sid,
        'title': title,
        'title_es': title_es,
        'checks': checks,
    }


def _definition(sections: list[dict]) -> dict:
    return {'template_version': 1, 'sections': sections}


DAY_DEFINITION = _definition([
    _section('front', 'Front / Checkout', 'Frente / Caja', [
        _check('d01', 'Counters and checkout surfaces wiped down', 'Mostradores y cajas limpiados'),
        _check('d02', 'No carts parked at the front', 'Ningun carrito estacionado al frente'),
        _check('d03', 'Left-out items at the front returned', 'Articulos dejados al frente devueltos'),
        _check('d04', 'Register supplies stocked (receipt paper, tape, bags)', 'Suministros de caja surtidos (papel, cinta, bolsas)'),
        _check('d05', 'No personal items at the stations', 'Nada personal en las estaciones'),
        _check('d06', 'Drawers organized', 'Cajones organizados'),
        _check('d07', 'No key left in a register', 'Ninguna llave dejada en una caja'),
        _check('d08', 'Testing area cleared', 'Area de prueba despejada'),
        _check('d09', 'Floors behind cashier stations swept', 'Piso detras de las cajas barrido'),
        _check('d10', 'Entry doorway clear, glass clean, signage current', 'Entrada despejada, vidrio limpio, letreros al dia'),
    ]),
    _section('trash', 'Trash', 'Basura', [
        _check('d11', 'Both register cans checked, emptied and relined if over half', 'Ambos botes de caja revisados, vaciados y con bolsa si pasan de la mitad', verify_prev=True),
        _check('d12', 'Parking lot can checked, emptied and relined if over half', 'Bote del estacionamiento revisado, vaciado y con bolsa si pasa de la mitad', verify_prev=True),
        _check('d13', 'Restroom cans checked, emptied and relined', 'Botes de banos revisados, vaciados y con bolsa', verify_prev=True),
        _check('d14', 'Back / receiving cans checked', 'Botes de atras / recibo revisados', verify_prev=True),
        _check('d15', 'Dumpster run if needed', 'Viaje al contenedor si hace falta'),
    ]),
    _section('restrooms', 'Restrooms', 'Banos', [
        _check('d16', 'Toilets, sinks, mirrors wiped', 'Inodoros, lavabos y espejos limpiados'),
        _check('d17', 'Floors swept and mopped', 'Pisos barridos y trapeados'),
        _check('d18', 'Toilet paper stocked', 'Papel de bano surtido', verify_prev=True),
        _check('d19', 'Soap stocked', 'Jabon surtido', verify_prev=True),
        _check('d20', 'Paper towels stocked', 'Toallas de papel surtidas', verify_prev=True),
    ]),
    _section('floor', 'Floor / Aisles', 'Piso / Pasillos', [
        _check('d21', 'Floors swept storewide', 'Pisos barridos en toda la tienda'),
        _check('d22', 'Aisles clear and walkable', 'Pasillos despejados y transitables'),
        _check('d23', 'Exits and paths to exits unblocked', 'Salidas y caminos a salidas sin bloqueo'),
        _check('d24', 'Abandoned carts returned', 'Carritos abandonados devueltos'),
        _check('d25', 'Carts moved to the cart corral', 'Carritos llevados al corral', verify_prev=True),
        _check('d26', 'Green carts returned to Processing', 'Carritos verdes devueltos a Procesamiento'),
        _check('d27', 'Put Back cart emptied', 'Carrito de devolver vaciado', verify_prev=True),
    ]),
    _section('back_stock', 'Back Stock', 'Bodega', [
        _check('d28', 'Back stock sorted by department, no loose piles', 'Bodega ordenada por departamento, sin montones sueltos', verify_prev=True),
        _check('d29', 'Aisles and pull paths clear', 'Pasillos y caminos de salida despejados', verify_prev=True),
        _check('d30', 'Shelves and bins labeled', 'Anaqueles y cajas etiquetados', verify_prev=True),
    ]),
])

OPEN_DEFINITION = _definition([
    _section('open', 'Staffing / Security', 'Personal / Seguridad', [
        _check('o31', 'Both automatic doors unlocked, set to AUTO, No Exit hit', 'Ambas puertas automaticas abiertas, en AUTO, No Exit activado', verify_prev=True),
        _check('o32', 'Clocked in', 'Registrado en el reloj'),
        _check('o33', 'Lights on at Receiving breaker box', 'Luces prendidas en el tablero de Recibo', verify_prev=True),
        _check('o34', 'Music on at speaker box', 'Musica prendida en la caja de parlantes', verify_prev=True),
        _check('o35', 'Whiteboard sign out and angled by the front door', 'Pizarron afuera e inclinado junto a la puerta', verify_prev=True),
        _check('o36', 'Till counted', 'Caja contada'),
        _check('o37', 'Walkie grabbed, channel 4', 'Walkie tomado, canal 4'),
        _check('o38', 'Neon OPEN sign on at 9:00am', 'Letrero neon OPEN prendido a las 9:00am', verify_prev=True),
        _check('o39', 'Someone stationed up front', 'Alguien estacionado al frente'),
        _check('o40', 'All staff carrying walkies', 'Todo el personal con walkie'),
        _check('o41', 'Showcases locked, keys accounted for', 'Vitrinas cerradas, llaves contabilizadas', verify_prev=True),
    ]),
])

CLOSE_DEFINITION = _definition([
    _section('close', 'Security End of Day', 'Seguridad de cierre', [
        _check('c42', 'Neon sign off at 5:50pm', 'Letrero neon apagado a las 5:50pm'),
        _check('c43', 'Whiteboard sign pulled inside', 'Pizarron metido adentro', verify_prev=True),
        _check('c44', 'Front door locked at 6:00pm', 'Puerta de frente cerrada a las 6:00pm'),
        _check('c45', 'Floor and restrooms walked to confirm building is empty', 'Piso y banos recorridos para confirmar que el edificio esta vacio'),
        _check('c46', 'Music off at speaker box', 'Musica apagada en la caja de parlantes'),
        _check('c47', 'Under-desk reset (trash can, clipboards, cleaning supplies, hanger basket only)', 'Reset bajo el escritorio (bote, tablas, limpieza, canasta de ganchos nomas)', verify_prev=True),
        _check('c48', 'Till closed, cash envelope in drop box', 'Caja cerrada, sobre de efectivo en el buzon', verify_prev=True),
        _check('c49', 'Walkie returned to charger', 'Walkie puesto a cargar', verify_prev=True),
        _check('c50', 'Garage door closed and latched', 'Puerta de garage cerrada y con seguro', verify_prev=True),
        _check('c51', 'Lights off at breaker box', 'Luces apagadas en el tablero'),
        _check('c52', 'Both automatic doors locked behind you', 'Ambas puertas automaticas cerradas detras de ti'),
    ]),
])

PROGRAM_TITLES = {
    'retail.open': (
        'Retail open',
        'First hour of the day, and a look at how the store was left.',
    ),
    'retail.day': (
        'Retail day',
        'Front, trash, restrooms, aisles, back stock. The work of the day.',
    ),
    'retail.close': (
        'Retail close',
        'Leave it the way you want to find it.',
    ),
}

PROGRAM_TIMES = {
    'retail.open': {'remind_time': time(9, 0), 'due_time': time(10, 0)},
    'retail.day': {'remind_time': time(12, 0), 'due_time': None},
    'retail.close': {'remind_time': time(17, 50), 'due_time': time(18, 0)},
}

# Missed if not done. Separate from Counts as late.
_END_OF_DAY = {
    'expire_rule': 'end_of_day',
    'expire_count': 1,
    'expire_unit': 'hours',
    'expire_from_time': None,
}
PROGRAM_EXPIRE = {
    'retail.open': {
        'expire_rule': 'after',
        'expire_count': 6,
        'expire_unit': 'hours',
        'expire_from_time': time(8, 30),
    },
    'retail.day': dict(_END_OF_DAY),
    'retail.close': dict(_END_OF_DAY),
    'retail.owner_spot': dict(_END_OF_DAY),
    'retail.section_audit': dict(_END_OF_DAY),
    'retail.section_tally': dict(_END_OF_DAY),
    'retail.work_cycle': {
        'expire_rule': 'never',
        'expire_count': 1,
        'expire_unit': 'hours',
        'expire_from_time': None,
    },
}

PROGRAM_DEFINITIONS = {
    'retail.open': OPEN_DEFINITION,
    'retail.day': DAY_DEFINITION,
    'retail.close': CLOSE_DEFINITION,
}

_SHIFT_SHARED = {
    'audience_type': 'shift',
    'audience_all': False,
    'assigned_department_ids': [],
    'assignment': 'pooled',
}
PROGRAM_AUDIENCE = {
    'retail.open': {**_SHIFT_SHARED, 'assigned_shifts': ['retail_open']},
    'retail.day': {**_SHIFT_SHARED, 'assigned_shifts': ['retail_day']},
    'retail.close': {**_SHIFT_SHARED, 'assigned_shifts': ['retail_close']},
    'retail.work_cycle': {
        **_SHIFT_SHARED,
        'assigned_shifts': ['retail_open', 'retail_day', 'retail_close', 'retail_cs'],
    },
    'retail.owner_spot': {
        'audience_type': 'person',
        'audience_all': False,
        'assigned_shifts': [],
        'assignment': 'per_person',
    },
    'retail.section_tally': {
        'audience_type': 'person',
        'audience_all': False,
        'assigned_shifts': [],
        'assignment': 'per_person',
    },
    'retail.section_audit': {
        'audience_type': 'person',
        'audience_all': False,
        'assigned_shifts': [],
        'assignment': 'per_person',
    },
}


def apply_program(Routine) -> None:
    """Retitle and reseed the three checklists on an already-migrated Routine model."""
    for key, definition in PROGRAM_DEFINITIONS.items():
        title, intro = PROGRAM_TITLES[key]
        times = PROGRAM_TIMES[key]
        Routine.objects.filter(system_key=key).update(
            title=title,
            intro=intro,
            definition=definition,
            remind_time=times['remind_time'],
            due_time=times['due_time'],
        )
    _maybe_apply_expire(Routine)
    _maybe_apply_audience(Routine)


def _maybe_apply_expire(Routine) -> None:
    names = {field.name for field in Routine._meta.fields}
    if 'expire_rule' not in names:
        return
    apply_expire(Routine)


def apply_expire(Routine) -> None:
    """Write the program missed-if-not-done clocks."""
    for key, fields in PROGRAM_EXPIRE.items():
        Routine.objects.filter(system_key=key).update(**fields)


def _maybe_apply_audience(Routine) -> None:
    names = {field.name for field in Routine._meta.fields}
    if 'audience_type' not in names:
        return
    apply_audience(Routine)


def apply_audience(Routine) -> None:
    """Write the program person / shift / department audiences."""
    for key, fields in PROGRAM_AUDIENCE.items():
        Routine.objects.filter(system_key=key).update(**fields)
