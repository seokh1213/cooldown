#!/usr/bin/env python3
"""
Community Dragon API에서 오공 Q 스킬 데이터 구조 확인
"""

import json
import urllib.request

def fetch_json(url):
    with urllib.request.urlopen(url) as response:
        return json.loads(response.read())

def main():
    print("Community Dragon API에서 오공 데이터 가져오는 중...")
    data = fetch_json("https://raw.communitydragon.org/latest/game/data/characters/monkeyking/monkeyking.bin.json")
    
    # Q 스킬 관련 키 찾기
    q_keys = [k for k in data.keys() if "DoubleAttack" in k or "MonkeyKingQ" in k]
    print("\n=== Q 스킬 관련 키들 ===")
    for key in q_keys[:10]:
        print(key)
    
    # 메인 Q 스킬 데이터 확인
    main_q_key = "Characters/MonkeyKing/Spells/MonkeyKingDoubleAttackAbility/MonkeyKingDoubleAttack"
    if main_q_key in data:
        print("\n=== 메인 Q 스킬 데이터 구조 ===")
        q_data = data[main_q_key]
        print(f"Top level keys: {list(q_data.keys())[:10]}")
        
        if "mSpell" in q_data:
            m_spell = q_data["mSpell"]
            print("\n=== mSpell 키들 ===")
            spell_keys = list(m_spell.keys())[:30]
            print(spell_keys)
            
            # DataValues 확인
            if "DataValues" in m_spell:
                print("\n=== DataValues ===")
                data_values = m_spell["DataValues"]
                print(f"Type: {type(data_values)}")
                if isinstance(data_values, dict):
                    dv_keys = list(data_values.keys())[:20]
                    print(f"DataValues keys: {dv_keys}")
                    for key in dv_keys[:5]:
                        val = data_values[key]
                        val_str = json.dumps(val)[:100]
                        print(f"{key}: {type(val).__name__} = {val_str}")
                elif isinstance(data_values, list):
                    print(f"DataValues is a list with {len(data_values)} items")
                    print(f"First few items: {data_values[:5]}")
            
            # mSpellCalculations 확인
            if "mSpellCalculations" in m_spell:
                print("\n=== mSpellCalculations ===")
                calc = m_spell["mSpellCalculations"]
                if isinstance(calc, dict):
                    calc_keys = list(calc.keys())[:20]
                    print(f"Keys: {calc_keys}")
                    for key in calc_keys[:5]:
                        val = calc[key]
                        print(f"{key}: {type(val).__name__}")
                        if isinstance(val, dict):
                            print(f"  Sub-keys: {list(val.keys())[:5]}")
            
            # cooldownTime 확인
            if "cooldownTime" in m_spell:
                print("\n=== cooldownTime ===")
                print(m_spell["cooldownTime"])
            
            # armorshred 관련 키 찾기
            print("\n=== armorshred 관련 키 검색 ===")
            all_keys = []
            if isinstance(m_spell, dict):
                all_keys.extend(m_spell.keys())
                for key, val in m_spell.items():
                    if isinstance(val, dict):
                        all_keys.extend([f"{key}.{k}" for k in val.keys()])
            
            armor_keys = [k for k in all_keys if "armor" in k.lower() or "shred" in k.lower()]
            print(f"Found {len(armor_keys)} keys: {armor_keys[:10]}")

if __name__ == "__main__":
    main()

